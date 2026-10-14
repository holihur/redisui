package redisclient

import "testing"

func TestParseClientList(t *testing.T) {
	raw := "id=3 addr=127.0.0.1:55000 name= db=0 age=12 idle=0 cmd=client|list\n" +
		"id=4 addr=10.0.0.1:55001 name=worker db=2 age=99 idle=5 cmd=get\n"
	rows := parseClientList(raw)
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	if rows[0]["addr"] != "127.0.0.1:55000" || rows[0]["db"] != "0" {
		t.Fatalf("row 0 parsed wrong: %#v", rows[0])
	}
	if rows[1]["name"] != "worker" || rows[1]["db"] != "2" {
		t.Fatalf("row 1 parsed wrong: %#v", rows[1])
	}
	if got := parseClientList("\n  \n"); len(got) != 0 {
		t.Fatalf("blank input should yield no rows, got %#v", got)
	}
}
