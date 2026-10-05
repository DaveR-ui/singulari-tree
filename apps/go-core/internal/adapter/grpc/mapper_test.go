package grpc

import (
	"strings"
	"testing"
	"time"

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

func TestBranchToProto(t *testing.T) {
	up := domain.RefName{Raw: "refs/remotes/origin/main"}
	got := branchToProto(domain.Branch{
		Name:      "main",
		RefName:   domain.RefName{Raw: "refs/heads/main"},
		Tip:       domain.Oid{Hex: strings.Repeat("a", 40), Kind: "SHA1"},
		Upstream:  &up,
		IsCurrent: true,
		Behind:    4,
	})
	if got.GetName() != "main" || got.GetRefName() != "refs/heads/main" {
		t.Errorf("branch = %+v, want main/refs/heads/main", got)
	}
	if !got.GetIsCurrent() || got.GetIsRemote() {
		t.Errorf("flags = current:%v remote:%v, want true/false", got.GetIsCurrent(), got.GetIsRemote())
	}
	if got.GetTip().GetHex() != strings.Repeat("a", 40) {
		t.Errorf("tip = %q", got.GetTip().GetHex())
	}
	if got.GetUpstream() != "refs/remotes/origin/main" {
		t.Errorf("upstream = %q", got.GetUpstream())
	}
	if got.GetBehind() != 4 {
		t.Errorf("behind = %d, want 4", got.GetBehind())
	}
}

func TestBranchToProtoNoOptional(t *testing.T) {
	got := branchToProto(domain.Branch{Name: "dev", RefName: domain.RefName{Raw: "refs/heads/dev"}})
	if got.GetTip() != nil {
		t.Errorf("tip = %+v, want nil for unset oid", got.GetTip())
	}
	if got.GetUpstream() != "" {
		t.Errorf("upstream = %q, want empty", got.GetUpstream())
	}
	if got.GetBehind() != 0 {
		t.Errorf("behind = %d, want 0", got.GetBehind())
	}
}

func TestRemoteToProto(t *testing.T) {
	got := remoteToProto(domain.Remote{
		Name:       "origin",
		Urls:       []string{"https://example.com/repo.git"},
		FetchSpecs: []string{"+refs/heads/*:refs/remotes/origin/*"},
	})
	if got.GetName() != "origin" || len(got.GetUrls()) != 1 || len(got.GetFetchSpecs()) != 1 {
		t.Fatalf("remoteToProto = %+v, want origin with url + fetch spec", got)
	}
}

func TestRemoteToProtoEmptySlices(t *testing.T) {
	got := remoteToProto(domain.Remote{Name: "origin"})
	if got.GetUrls() == nil || got.GetFetchSpecs() == nil {
		t.Errorf("empty remote slices should be non-nil, got urls=%v fetch=%v", got.GetUrls(), got.GetFetchSpecs())
	}
}

func TestTagToProto(t *testing.T) {
	msg := "release one"
	when := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	got := tagToProto(domain.Tag{
		Name:      "v1.0.0",
		RefName:   domain.RefName{Raw: "refs/tags/v1.0.0"},
		Target:    domain.Oid{Hex: strings.Repeat("c", 40), Kind: "SHA1"},
		Tagger:    &domain.Signature{Name: "Alice", Email: "alice@example.com", When: when},
		Message:   &msg,
		Annotated: true,
	})
	if got.GetName() != "v1.0.0" || !got.GetAnnotated() {
		t.Errorf("tag = %+v, want v1.0.0 annotated", got)
	}
	if got.GetTarget().GetHex() != strings.Repeat("c", 40) {
		t.Errorf("target = %q", got.GetTarget().GetHex())
	}
	if got.GetTagger().GetEmail() != "alice@example.com" {
		t.Errorf("tagger email = %q", got.GetTagger().GetEmail())
	}
	if got.GetMessage() != "release one" {
		t.Errorf("message = %q", got.GetMessage())
	}
}

func TestTagToProtoLightweight(t *testing.T) {
	got := tagToProto(domain.Tag{
		Name:    "light",
		RefName: domain.RefName{Raw: "refs/tags/light"},
	})
	if got.GetTagger() != nil || got.GetMessage() != "" {
		t.Errorf("lightweight tag should have no tagger/message, got %+v", got)
	}
	if got.GetTarget() != nil {
		t.Errorf("target = %+v, want nil for unset oid", got.GetTarget())
	}
}
