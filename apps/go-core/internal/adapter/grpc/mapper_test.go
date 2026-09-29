package grpc

import (
	"strings"
	"testing"

	"github.com/SingulariTree/go-core/internal/domain"
)

func TestCommitToProtoMapsRefs(t *testing.T) {
	c := domain.Commit{
		Oid: domain.Oid{Hex: strings.Repeat("a", 40), Kind: "SHA1"},
		Refs: []domain.RefLabel{
			{Name: "HEAD", Kind: domain.RefKindHead},
			{Name: "main", Kind: domain.RefKindBranch},
			{Name: "origin/main", Kind: domain.RefKindRemote},
			{Name: "v1.0.0", Kind: domain.RefKindTag},
		},
	}
	got := commitToProto(c)
	refs := got.GetRefs()
	if len(refs) != 4 {
		t.Fatalf("refs len = %d, want 4", len(refs))
	}
	want := []struct{ name, kind string }{
		{"HEAD", "head"},
		{"main", "branch"},
		{"origin/main", "remote"},
		{"v1.0.0", "tag"},
	}
	for i, w := range want {
		if refs[i].GetName() != w.name || refs[i].GetKind() != w.kind {
			t.Errorf("refs[%d] = {%q,%q}, want {%q,%q}", i, refs[i].GetName(), refs[i].GetKind(), w.name, w.kind)
		}
	}
	if got.GetOid().GetHex() != c.Oid.Hex {
		t.Errorf("oid = %q, want %q", got.GetOid().GetHex(), c.Oid.Hex)
	}
}

func TestCommitToProtoNoRefs(t *testing.T) {
	got := commitToProto(domain.Commit{Oid: domain.Oid{Hex: strings.Repeat("b", 40), Kind: "SHA1"}})
	if len(got.GetRefs()) != 0 {
		t.Fatalf("refs len = %d, want 0", len(got.GetRefs()))
	}
}

func TestLaneToProto(t *testing.T) {
	got := laneToProto(domain.Lane{Index: 3, Color: 2, Continues: true})
	if got.GetIndex() != 3 || got.GetColor() != 2 || !got.GetContinues() {
		t.Fatalf("laneToProto = {index:%d color:%d continues:%v}, want {3 2 true}",
			got.GetIndex(), got.GetColor(), got.GetContinues())
	}
}
