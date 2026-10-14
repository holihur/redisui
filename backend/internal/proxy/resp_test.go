package proxy

import (
	"reflect"
	"testing"
)

func TestRespParser(t *testing.T) {
	p := &respParser{}
	cmd := "*2\r\n$3\r\nGET\r\n$1\r\nk\r\n"
	if got := p.Feed([]byte(cmd)); !reflect.DeepEqual(got, []string{"GET"}) {
		t.Fatalf("single command: %#v", got)
	}
}

func TestRespParserPipelined(t *testing.T) {
	p := &respParser{}
	got := p.Feed([]byte("*1\r\n$4\r\nPING\r\n*2\r\n$3\r\nSET\r\n$1\r\nk\r\n"))
	if !reflect.DeepEqual(got, []string{"PING", "SET"}) {
		t.Fatalf("pipelined: %#v", got)
	}
}

func TestRespParserPartial(t *testing.T) {
	p := &respParser{}
	if got := p.Feed([]byte("*2\r\n$3\r\nGE")); got != nil {
		t.Fatalf("partial should yield nothing: %#v", got)
	}
	if got := p.Feed([]byte("T\r\n$1\r\nk\r\n")); !reflect.DeepEqual(got, []string{"GET"}) {
		t.Fatalf("completion: %#v", got)
	}
}

func TestRespParserInline(t *testing.T) {
	p := &respParser{}
	if got := p.Feed([]byte("ping\r\n")); !reflect.DeepEqual(got, []string{"PING"}) {
		t.Fatalf("inline: %#v", got)
	}
}

func TestRespParserMalformedRecovers(t *testing.T) {
	p := &respParser{}
	// Malformed array header, then a valid command.
	got := p.Feed([]byte("*x\r\n*1\r\n$4\r\nPING\r\n"))
	if len(got) != 1 || got[0] != "PING" {
		t.Fatalf("recovery: %#v", got)
	}
}
