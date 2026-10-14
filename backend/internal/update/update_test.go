package update

import (
	"runtime"
	"strings"
	"testing"
)

func TestIsNewer(t *testing.T) {
	cases := []struct {
		current string
		latest  string
		want    bool
	}{
		{"v1.0.0", "v1.0.1", true},
		{"v1.0.0", "v1.1.0", true},
		{"v1.0.0", "v2.0.0", true},
		{"1.2.3", "v1.2.4", true},
		{"v1.2.3", "v1.2.3", false},
		{"v2.0.0", "v1.9.9", false},
		{"dev", "v1.0.0", true},
		{"v1.0.0", "not-a-version", false},
		{"v1.2.3", "v1.2.4-rc1", true}, // pre-release tag still parses to 1.2.4
	}
	for _, tc := range cases {
		if got := isNewer(tc.current, tc.latest); got != tc.want {
			t.Errorf("isNewer(%q,%q)=%v want %v", tc.current, tc.latest, got, tc.want)
		}
	}
}

func TestParseSemver(t *testing.T) {
	if v, ok := parseSemver("v1.2.3"); !ok || v != [3]int{1, 2, 3} {
		t.Fatalf("parseSemver v1.2.3 = %v %v", v, ok)
	}
	if v, ok := parseSemver("2.0"); !ok || v != [3]int{2, 0, 0} {
		t.Fatalf("parseSemver 2.0 = %v %v", v, ok)
	}
	if _, ok := parseSemver("x.y.z"); ok {
		t.Fatal("expected parse failure")
	}
}

func TestLookupChecksum(t *testing.T) {
	sums := "abc123  redisui_linux_amd64.tar.gz\ndef456  redisui_darwin_arm64.tar.gz\n"
	if got := lookupChecksum(sums, "redisui_linux_amd64.tar.gz"); got != "abc123" {
		t.Fatalf("lookup = %q", got)
	}
	if got := lookupChecksum(sums, "missing.tar.gz"); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestAssetFileName(t *testing.T) {
	name := assetFileName()
	if !strings.Contains(name, runtime.GOOS) || !strings.Contains(name, runtime.GOARCH) {
		t.Fatalf("asset name %q does not match platform", name)
	}
}
