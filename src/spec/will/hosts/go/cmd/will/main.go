// SPDX-License-Identifier: MIT
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"reflect"

	"github.com/jackskip22/will/hosts/go"
)

func check(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var suite struct {
		Vectors []json.RawMessage `json:"vectors"`
	}
	if err := json.Unmarshal(data, &suite); err != nil {
		return err
	}
	if len(suite.Vectors) == 0 {
		return fmt.Errorf("suite has no vectors")
	}
	passed := 0
	for _, raw := range suite.Vectors {
		var vector struct {
			ID     string          `json:"id"`
			Expect json.RawMessage `json:"expect"`
		}
		if err := json.Unmarshal(raw, &vector); err != nil {
			return err
		}
		actual, err := will.RunCase(raw)
		if err != nil {
			fmt.Fprintf(os.Stderr, "FAIL %s: %v\n", vector.ID, err)
			continue
		}
		encoded, err := json.Marshal(actual)
		if err != nil {
			return err
		}
		got, err := jsonValue(encoded)
		if err != nil {
			return err
		}
		want, err := jsonValue(vector.Expect)
		if err != nil {
			return fmt.Errorf("%s: missing or invalid expected result: %w", vector.ID, err)
		}
		if !reflect.DeepEqual(got, want) {
			fmt.Fprintf(os.Stderr, "FAIL %s\n  expected: %s\n  actual:   %s\n", vector.ID, vector.Expect, encoded)
			continue
		}
		passed++
	}
	fmt.Printf("%d/%d vectors passed\n", passed, len(suite.Vectors))
	if passed != len(suite.Vectors) {
		return fmt.Errorf("%d vectors failed", len(suite.Vectors)-passed)
	}
	return nil
}

func jsonValue(data []byte) (any, error) {
	var value any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	err := decoder.Decode(&value)
	return value, err
}

func adapter(input io.Reader, output io.Writer) error {
	reader := bufio.NewReader(input)
	encoder := json.NewEncoder(output)
	bad := false
	for {
		line, readErr := reader.ReadBytes('\n')
		if readErr != nil && !errors.Is(readErr, io.EOF) {
			return readErr
		}
		if len(line) > 0 {
			result, err := will.RunCase(line)
			if err != nil {
				bad = true
				result = map[string]string{"error": "invalid_request"}
			} else {
				var request struct {
					ID   *string `json:"id"`
					Kind string  `json:"kind"`
				}
				if err := json.Unmarshal(line, &request); err != nil {
					return err
				}
				envelope := map[string]any{"kind": request.Kind, "result": result}
				if request.ID != nil {
					envelope["id"] = *request.ID
				}
				result = envelope
			}
			if err := encoder.Encode(result); err != nil {
				return err
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
	}
	if bad {
		return fmt.Errorf("invalid adapter request")
	}
	return nil
}

func run(args []string) error {
	if len(args) == 2 && args[0] == "check" {
		return check(args[1])
	}
	if len(args) == 1 && args[0] == "--adapter" {
		return adapter(os.Stdin, os.Stdout)
	}
	if len(args) == 2 && args[0] == "parse" {
		data, err := os.ReadFile(args[1])
		if err != nil {
			return err
		}
		document := will.Parse(data)
		if err := json.NewEncoder(os.Stdout).Encode(document); err != nil {
			return err
		}
		if document.Faulted {
			return fmt.Errorf("document is faulted")
		}
		return nil
	}
	return fmt.Errorf("usage: will check vectors.json | will --adapter | will parse document.md")
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
