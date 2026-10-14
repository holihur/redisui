package api

import (
	"reflect"
	"testing"
)

func TestSplitCSV(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{in: "", want: nil},
		{in: "  ", want: nil},
		{in: "a,b,c", want: []string{"a", "b", "c"}},
		{in: " a , b ,, c ", want: []string{"a", "b", "c"}},
	}
	for _, tc := range cases {
		if got := splitCSV(tc.in); !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("splitCSV(%q) = %#v, want %#v", tc.in, got, tc.want)
		}
	}
}

func TestJSONStringSliceNeverNull(t *testing.T) {
	if got := jsonStringSlice(nil); got != "[]" {
		t.Fatalf("nil slice should encode as [], got %s", got)
	}
	if got := jsonStringSlice([]string{"a"}); got != `["a"]` {
		t.Fatalf("unexpected: %s", got)
	}
}
