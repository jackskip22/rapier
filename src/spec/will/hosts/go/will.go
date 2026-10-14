// SPDX-License-Identifier: MIT
// Package will reads and evaluates the Will/1 Markdown binding.
package will

import (
	"bytes"
	"sort"
	"strings"
	"unicode/utf8"
)

// Span is a zero-based, half-open byte range.
type Span [2]int

// Marker includes the line terminator in its byte span.
type Marker struct {
	Line     int  `json:"line"`
	ByteSpan Span `json:"byteSpan"`
}

// Fault identifies a document error. Line is nil for an invalid UTF-8 sequence.
type Fault struct {
	Mode     string `json:"mode"`
	Line     *int   `json:"line"`
	ByteSpan Span   `json:"byteSpan"`
}

// Region is the content between one complete marker pair.
type Region struct {
	Index        int     `json:"index"`
	Law          string  `json:"law"`
	Intent       *string `json:"intent"`
	Opener       Marker  `json:"opener"`
	Closer       Marker  `json:"closer"`
	GovernedSpan Span    `json:"governedSpan"`
}

// Document is the normalized parse result, including completed regions on a faulted document.
type Document struct {
	Faulted bool     `json:"faulted"`
	Faults  []Fault  `json:"faults"`
	Regions []Region `json:"regions"`
}

// Splice replaces bytes in the unchanged source document.
type Splice struct {
	Start  int
	End    int
	Insert []byte
}

// Decision is the complete evaluation response.
type Decision struct {
	Outcome string  `json:"outcome"`
	Reason  string  `json:"reason,omitempty"`
	Rule    string  `json:"rule,omitempty"`
	Region  *int    `json:"region,omitempty"`
	Law     string  `json:"law,omitempty"`
	Faults  []Fault `json:"faults,omitempty"`
}

// Parse reads strict UTF-8 bytes without normalizing text or line endings.
func Parse(source []byte) Document {
	document := Document{Faults: []Fault{}, Regions: []Region{}}
	if bad := invalidUTF8(source); bad != nil {
		document.Faulted = true
		document.Faults = append(document.Faults, Fault{Mode: "invalid_utf8", ByteSpan: *bad})
		return document
	}
	var pending *Region
	for start, line := 0, 0; start < len(source); line++ {
		end := start
		for end < len(source) && source[end] != '\n' && source[end] != '\r' {
			end++
		}
		text := source[start:end]
		if end < len(source) {
			if source[end] == '\r' && end+1 < len(source) && source[end+1] == '\n' {
				end++
			}
			end++
		}
		marker := Marker{Line: line, ByteSpan: Span{start, end}}
		kind, law, intent, mode := classifyMarker(text)
		if mode != "" {
			document.Faults = append(document.Faults, markerFault(mode, marker))
		} else if kind == "open" {
			if pending != nil {
				document.Faults = append(document.Faults, markerFault("unpaired_marker", marker))
			} else {
				pending = &Region{Law: law, Intent: intent, Opener: marker}
			}
		} else if kind == "close" {
			if pending == nil {
				document.Faults = append(document.Faults, markerFault("unpaired_marker", marker))
			} else {
				pending.Index = len(document.Regions)
				pending.Closer = marker
				pending.GovernedSpan = Span{pending.Opener.ByteSpan[1], start}
				document.Regions = append(document.Regions, *pending)
				pending = nil
			}
		}
		start = end
	}
	if pending != nil {
		document.Faults = append(document.Faults, markerFault("unpaired_marker", pending.Opener))
	}
	sort.SliceStable(document.Faults, func(i, j int) bool {
		return document.Faults[i].ByteSpan[0] < document.Faults[j].ByteSpan[0]
	})
	document.Faulted = len(document.Faults) != 0
	return document
}

func markerFault(mode string, marker Marker) Fault {
	line := marker.Line
	return Fault{Mode: mode, Line: &line, ByteSpan: marker.ByteSpan}
}

func invalidUTF8(source []byte) *Span {
	for at := 0; at < len(source); {
		lead := source[at]
		if lead < 0x80 {
			at++
			continue
		}
		var width, scalar, minimum int
		switch {
		case lead&0xe0 == 0xc0:
			width, scalar, minimum = 2, int(lead&0x1f), 0x80
		case lead&0xf0 == 0xe0:
			width, scalar, minimum = 3, int(lead&0x0f), 0x800
		case lead&0xf8 == 0xf0:
			width, scalar, minimum = 4, int(lead&0x07), 0x10000
		default:
			return &Span{at, at + 1}
		}
		if at+width > len(source) {
			return &Span{at, len(source)}
		}
		for i := 1; i < width; i++ {
			if source[at+i]&0xc0 != 0x80 {
				return &Span{at, at + 1}
			}
			scalar = scalar<<6 | int(source[at+i]&0x3f)
		}
		if scalar < minimum || scalar > 0x10ffff || scalar >= 0xd800 && scalar <= 0xdfff {
			return &Span{at, at + width}
		}
		at += width
	}
	return nil
}

func applied() Decision {
	return Decision{Outcome: "applied"}
}

func invalid(rule string) Decision {
	return Decision{Outcome: "invalid", Reason: "precondition", Rule: rule}
}

func refused(rule string, region *Region, faults []Fault) Decision {
	decision := Decision{Outcome: "refused", Reason: "document_law", Rule: rule, Faults: faults}
	if region != nil {
		index := region.Index
		decision.Region, decision.Law = &index, region.Law
	}
	return decision
}

func touches(splice Splice, span Span) bool {
	if splice.Start == splice.End {
		return splice.Start > span[0] && splice.Start < span[1]
	}
	return splice.Start < span[1] && splice.End > span[0]
}

func replace(source []byte, splices []Splice) []byte {
	var result bytes.Buffer
	last := 0
	for _, splice := range splices {
		result.Write(source[last:splice.Start])
		result.Write(splice.Insert)
		last = splice.End
	}
	result.Write(source[last:])
	return result.Bytes()
}

func withoutFinalTerminator(content []byte) []byte {
	if bytes.HasSuffix(content, []byte("\r\n")) {
		return content[:len(content)-2]
	}
	if len(content) > 0 && (content[len(content)-1] == '\r' || content[len(content)-1] == '\n') {
		return content[:len(content)-1]
	}
	return content
}

func markerSurvives(source, result []byte, before, after Marker, splices []Splice) bool {
	start := before.ByteSpan[0]
	for _, splice := range splices {
		if splice.End > before.ByteSpan[0] {
			break
		}
		start += len(splice.Insert) - (splice.End - splice.Start)
	}
	// Inserted marker copies cannot stand in for surviving source markers.
	span := Span{start, start + before.ByteSpan[1] - before.ByteSpan[0]}
	return after.ByteSpan == span && bytes.Equal(source[before.ByteSpan[0]:before.ByteSpan[1]], result[span[0]:span[1]])
}

func classifyMarker(line []byte) (kind, law string, intent *string, fault string) {
	text := string(line)
	if strings.HasPrefix(text, "<!--will/") || strings.HasPrefix(text, "<!--/will") {
		return "", "", nil, "malformed_marker"
	}
	if strings.HasPrefix(text, "<!-- /will") {
		if text == "<!-- /will -->" {
			return "close", "", nil, ""
		}
		return "", "", nil, "malformed_marker"
	}
	const prefix = "<!-- will/"
	if !strings.HasPrefix(text, prefix) {
		return "", "", nil, ""
	}
	version, _, _ := strings.Cut(text[len(prefix):], " ")
	if version != "1" {
		return "", "", nil, "unknown_version"
	}
	const opening = "<!-- will/1 "
	const closing = " -->"
	if !strings.HasPrefix(text, opening) || !strings.HasSuffix(text, closing) || len(text) < len(opening)+len(closing) {
		return "", "", nil, "malformed_marker"
	}
	body := text[len(opening) : len(text)-len(closing)]
	end := len(body)
	for index, scalar := range body {
		if lawSeparator(scalar) {
			end = index
			break
		}
	}
	word, tail := body[:end], body[end:]
	if word == "" || tail != "" && !strings.HasPrefix(tail, ": ") {
		return "", "", nil, "malformed_marker"
	}
	if word != "keep" && word != "append" && word != "edit" {
		return "", "", nil, "unknown_law"
	}
	if tail != "" {
		words := tail[2:]
		if words == "" || strings.Contains(words, "--") {
			return "", "", nil, "malformed_marker"
		}
		if utf8.RuneCountInString(words) > 512 {
			return "", "", nil, "intent_over_bound"
		}
		intent = &words
	}
	return "open", word, intent, ""
}

func lawSeparator(scalar rune) bool {
	switch scalar {
	case ':', '\t', '\n', '\v', '\f', '\r', ' ', '\u00a0', '\u1680', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff':
		return true
	default:
		return scalar >= '\u2000' && scalar <= '\u200a'
	}
}

// Evaluate judges all splices against the unchanged source as one act.
// A nil splice slice is invalid; use an empty slice for an empty act.
func Evaluate(source []byte, splices []Splice, path string) Decision {
	if path != "working" && path != "authoring" {
		return invalid("unknown_path")
	}
	if splices == nil {
		return invalid("malformed_splice")
	}
	for _, splice := range splices {
		if splice.Start < 0 || splice.End < splice.Start {
			return invalid("malformed_splice")
		}
		if splice.End > len(source) {
			return invalid("out_of_range_splice")
		}
	}
	ordered := append([]Splice{}, splices...)
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].Start != ordered[j].Start {
			return ordered[i].Start < ordered[j].Start
		}
		return ordered[i].End < ordered[j].End
	})
	for i := 1; i < len(ordered); i++ {
		if ordered[i].Start < ordered[i-1].End || ordered[i].Start == ordered[i-1].Start {
			return invalid("overlapping_splices")
		}
	}
	if path == "authoring" || len(ordered) == 0 {
		return applied()
	}
	before := Parse(source)
	if before.Faulted {
		return refused("before_faulted", nil, before.Faults)
	}
	for i := range before.Regions {
		region := &before.Regions[i]
		for _, splice := range ordered {
			if touches(splice, region.Opener.ByteSpan) || touches(splice, region.Closer.ByteSpan) {
				return refused("marker_span_touched", region, nil)
			}
		}
	}
	result := replace(source, ordered)
	after := Parse(result)
	if after.Faulted {
		return refused("result_faulted", nil, after.Faults)
	}
	if len(before.Regions) != len(after.Regions) {
		return refused("marker_sequence_mismatch", nil, nil)
	}
	for i, old := range before.Regions {
		new := after.Regions[i]
		if !markerSurvives(source, result, old.Opener, new.Opener, ordered) || !markerSurvives(source, result, old.Closer, new.Closer, ordered) {
			return refused("marker_sequence_mismatch", nil, nil)
		}
	}
	for i := range before.Regions {
		old, new := &before.Regions[i], &after.Regions[i]
		oldBytes := source[old.GovernedSpan[0]:old.GovernedSpan[1]]
		newBytes := result[new.GovernedSpan[0]:new.GovernedSpan[1]]
		switch old.Law {
		case "keep":
			if !bytes.Equal(oldBytes, newBytes) {
				return refused("law_violated", old, nil)
			}
		case "append":
			if !bytes.HasPrefix(withoutFinalTerminator(newBytes), withoutFinalTerminator(oldBytes)) {
				return refused("law_violated", old, nil)
			}
		}
	}
	return applied()
}
