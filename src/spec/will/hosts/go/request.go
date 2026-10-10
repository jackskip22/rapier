// SPDX-License-Identifier: MIT
package will

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"strconv"
	"strings"
	"unicode/utf8"
)

// ErrInvalidRequest means the JSON request or its document bytes could not be read.
var ErrInvalidRequest = errors.New("invalid request")

// RunCase reads one JSON parse or evaluate request and returns its normalized result.
func RunCase(raw json.RawMessage) (any, error) {
	if !utf8.Valid(raw) || !json.Valid(raw) {
		return nil, ErrInvalidRequest
	}
	var request map[string]json.RawMessage
	if err := json.Unmarshal(raw, &request); err != nil || request == nil {
		return nil, ErrInvalidRequest
	}
	if id, present := request["id"]; present {
		id = bytes.TrimSpace(id)
		if len(id) == 0 || id[0] != '"' || !scalarJSON(id) {
			return nil, ErrInvalidRequest
		}
	}
	var kind string
	if err := json.Unmarshal(request["kind"], &kind); err != nil {
		return nil, ErrInvalidRequest
	}
	switch kind {
	case "parse":
		doc, err := readBytes(request, "doc")
		if err != nil {
			return nil, ErrInvalidRequest
		}
		return Parse(doc), nil
	case "evaluate":
		before, err := readBytes(request, "before")
		if err != nil {
			return nil, ErrInvalidRequest
		}
		pathRaw, present := request["path"]
		if !present {
			return nil, ErrInvalidRequest
		}
		var path string
		if err := json.Unmarshal(pathRaw, &path); err != nil || path != "working" && path != "authoring" {
			return invalid("unknown_path"), nil
		}
		splices, rule := readSplices(request["splices"], len(before))
		if rule != "" {
			return invalid(rule), nil
		}
		return Evaluate(before, splices, path), nil
	default:
		return nil, ErrInvalidRequest
	}
}

func readBytes(fields map[string]json.RawMessage, name string) ([]byte, error) {
	plain, hasPlain := fields[name]
	encoded, hasEncoded := fields[name+"Base64"]
	if hasPlain == hasEncoded {
		return nil, ErrInvalidRequest
	}
	raw := plain
	if hasEncoded {
		raw = encoded
	}
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || raw[0] != '"' || !scalarJSON(raw) {
		return nil, ErrInvalidRequest
	}
	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		return nil, ErrInvalidRequest
	}
	if !hasEncoded {
		return []byte(text), nil
	}
	decoded, err := base64.StdEncoding.Strict().DecodeString(text)
	if err != nil || base64.StdEncoding.EncodeToString(decoded) != text {
		return nil, ErrInvalidRequest
	}
	return decoded, nil
}

func readSplices(raw json.RawMessage, length int) ([]Splice, string) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || raw[0] != '[' {
		return nil, "malformed_splice"
	}
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, "malformed_splice"
	}
	splices := make([]Splice, 0, len(items))
	bound, _ := readInteger([]byte(strconv.Itoa(length)))
	for _, item := range items {
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(item, &fields); err != nil || fields == nil {
			return nil, "malformed_splice"
		}
		start, startOK := readInteger(fields["start"])
		end, endOK := readInteger(fields["end"])
		insert, err := readBytes(fields, "insert")
		if !startOK || !endOK || start.compare(end) > 0 || err != nil {
			return nil, "malformed_splice"
		}
		if end.compare(bound) > 0 {
			return nil, "out_of_range_splice"
		}
		splices = append(splices, Splice{Start: start.intValue(), End: end.intValue(), Insert: insert})
	}
	return splices, ""
}

// Decimal offsets remain exact without allocating a power of ten.
type decimalInteger struct {
	digits string
	zeros  big.Int
	width  big.Int
}

func readInteger(raw json.RawMessage) (decimalInteger, bool) {
	var number decimalInteger
	text := strings.TrimSpace(string(raw))
	if text == "" || !(text[0] == '-' || text[0] >= '0' && text[0] <= '9') {
		return number, false
	}
	negative := text[0] == '-'
	if negative {
		text = text[1:]
	}
	if index := strings.IndexAny(text, "eE"); index >= 0 {
		if _, ok := number.zeros.SetString(text[index+1:], 10); !ok {
			return number, false
		}
		text = text[:index]
	}
	fraction := 0
	if index := strings.IndexByte(text, '.'); index >= 0 {
		fraction = len(text) - index - 1
		text = text[:index] + text[index+1:]
	}
	text = strings.TrimLeft(text, "0")
	if text == "" {
		number.digits = "0"
		number.zeros.SetInt64(0)
		number.width.SetInt64(1)
		return number, true
	}
	if negative {
		return number, false
	}
	number.digits = strings.TrimRight(text, "0")
	number.zeros.Sub(&number.zeros, big.NewInt(int64(fraction-(len(text)-len(number.digits)))))
	if number.zeros.Sign() < 0 {
		return number, false
	}
	number.width.Add(&number.zeros, big.NewInt(int64(len(number.digits))))
	return number, true
}

func (number decimalInteger) compare(other decimalInteger) int {
	if number.digits == "0" || other.digits == "0" {
		if number.digits == other.digits {
			return 0
		}
		if number.digits == "0" {
			return -1
		}
		return 1
	}
	if order := number.width.Cmp(&other.width); order != 0 {
		return order
	}
	for i := 0; i < max(len(number.digits), len(other.digits)); i++ {
		a, b := byte('0'), byte('0')
		if i < len(number.digits) {
			a = number.digits[i]
		}
		if i < len(other.digits) {
			b = other.digits[i]
		}
		if a < b {
			return -1
		}
		if a > b {
			return 1
		}
	}
	return 0
}

func (number decimalInteger) intValue() int {
	value, _ := strconv.Atoi(number.digits + strings.Repeat("0", int(number.zeros.Int64())))
	return value
}

// encoding/json replaces malformed Unicode, so check scalars before decoding.
func scalarJSON(raw []byte) bool {
	if !utf8.Valid(raw) || !json.Valid(raw) {
		return false
	}
	quoted := false
	for i := 0; i < len(raw); i++ {
		if raw[i] == '"' {
			quoted = !quoted
			continue
		}
		if !quoted || raw[i] != '\\' {
			continue
		}
		i++
		if raw[i] != 'u' {
			continue
		}
		value, _ := strconv.ParseUint(string(raw[i+1:i+5]), 16, 16)
		i += 4
		if value >= 0xd800 && value <= 0xdbff {
			if i+6 >= len(raw) || raw[i+1] != '\\' || raw[i+2] != 'u' {
				return false
			}
			next, err := strconv.ParseUint(string(raw[i+3:i+7]), 16, 16)
			if err != nil || next < 0xdc00 || next > 0xdfff {
				return false
			}
			i += 6
		} else if value >= 0xdc00 && value <= 0xdfff {
			return false
		}
	}
	return true
}
