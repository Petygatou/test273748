import { Link, createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, Heart, MessageCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "../components/avatars";
import { Composer } from "../components/Composer";
import { MediaCarousel } from "../components/MediaCarousel";
import { StoriesBar, StoryComposer, StoryViewer } from "../components/Stories";
import { Alert, Card } from "../components/ui";
import { useAuth } from "../lib/auth";
import { getCommunity, type Author, type Post, type Story } from "../lib/community";
import { timeAgo } from "../lib/format";
import { useRealtime } from "../lib/realtime";

export const Route = createFileRoute("/comunidade")({
  component: CommunityPage,
});

function CommunityPage() {
  const auth = useAuth();
  const backend = getCommunity();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [composeStory, setComposeStory] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const canWrite = Boolean(auth.user);
  const canPublish = auth.isAdmin;

  const load = useCallback(async () => {
    try {
      const r = await backend.load();
      setPosts(r.posts);
      setStories(r.stories);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar a comunidade");
      setPosts((p) => p ?? []);
    }
  }, [backend]);

  useEffect(() => {
    if (auth.ready) void load();
  }, [auth.ready, auth.user?.id, load]);
  useRealtime(["community", "users"], () => void load());

  const act = async (fn: () => Promise<void>) => {
    if (!canWrite) {
      setErro("Entre na sua conta (Minha conta) para interagir.");
      return;
    }
    try {
      setErro(null);
      await fn();
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold">Comunidade</h1>
        <p className="text-sm text-[var(--color-ink-3)]">
          Novidades oficiais do Tropa em tempo real. Curta, comente e vote nas enquetes.{" "}
          {!auth.user && (
            <Link to="/conta" className="font-semibold text-[var(--color-brand)] underline">
              Entre para participar
            </Link>
          )}
        </p>
      </div>
      <Card className="p-3">
        <StoriesBar stories={stories} me={auth.me} onCreate={canPublish ? () => setComposeStory(true) : undefined} onOpen={setViewing} />
      </Card>
      {erro && <Alert tone="warning">{erro}</Alert>}
      {canPublish && <Composer me={auth.me} onPublish={async (p) => {
            await backend.createPost(p, auth.me);
            await load();
          }} />}
      {posts == null ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
      ) : (
        posts.map((p) => (
          <PostCard
            key={p.id}
            p={p}
            me={auth.me}
            onLike={() => act(() => backend.toggleLike(p.id))}
            onVote={(i) => act(() => backend.vote(p.id, i))}
            onComment={(t) => act(() => backend.addComment(p.id, t))}
            onDelete={() => act(() => backend.deletePost(p.id))}
          />
        ))
      )}
      {composeStory && canPublish && (
        <StoryComposer
          onClose={() => setComposeStory(false)}
          onPublish={async (s) => {
            await backend.createStory(s, auth.me);
            await load();
          }}
        />
      )}
      {viewing && (
        <StoryViewer
          stories={stories}
          startAuthor={viewing}
          onClose={() => setViewing(null)}
          onDelete={async (id) => {
            await backend.deleteStory(id);
            await load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------ post ------------------------------ */

function PostCard({ p, me, onLike, onVote, onComment, onDelete }: { p: Post; me: Author; onLike: () => void; onVote: (i: number) => void; onComment: (t: string) => void; onDelete: () => void }) {
  const [comment, setComment] = useState("");
  const [showAll, setShowAll] = useState(false);
  const totalVotes = p.poll ? p.poll.votos.reduce((a, b) => a + b, 0) : 0;
  const comments = showAll ? p.comments : p.comments.slice(-3);
  return (
    <Card as="article" className="overflow-hidden">
      <header className="flex items-center gap-3 p-3">
        <Avatar k={p.author.avatar} size={38} />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-sm font-semibold">
            {p.author.nome}
            {p.author.oficial && <BadgeCheck size={15} className="text-[var(--color-gold)]" aria-label="Oficial" />}
          </div>
          <div className="text-[11px] text-[var(--color-ink-3)]">{timeAgo(p.criadoEm)}</div>
        </div>
        {p.podeApagar && (
          <button className="ml-auto text-[var(--color-ink-3)] hover:text-[var(--color-critical-ink)]" onClick={() => confirm("Apagar esta publicação?") && onDelete()} aria-label="Apagar publicação">
            <Trash2 size={16} />
          </button>
        )}
      </header>
      {p.texto && <p className="px-3 pb-3 text-sm break-words whitespace-pre-wrap text-[var(--color-ink-2)]">{p.texto}</p>}
      {(() => {
        const midias = p.midias?.length ? p.midias : p.media ? [p.media] : [];
        // dois toques na foto só curtem (nunca descurtem), como no Instagram
        return midias.length ? <MediaCarousel midias={midias} onDoubleLike={() => !p.liked && onLike()} /> : null;
      })()}
      {p.poll && (
        <div className="space-y-2 px-3 pt-3">
          <div className="text-sm font-semibold">{p.poll.pergunta}</div>
          {p.poll.opcoes.map((o, i) => {
            const v = p.poll!.votos[i] ?? 0;
            const share = totalVotes ? v / totalVotes : 0;
            const mine = p.poll!.meuVoto === i;
            const voted = p.poll!.meuVoto != null;
            return (
              <button key={i} onClick={() => onVote(i)} className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm ${mine ? "border-[var(--color-brand)]" : "border-[var(--color-line)]"}`} aria-pressed={mine}>
                {voted && <span className="absolute inset-y-0 left-0 bg-[var(--color-series-a)]/25" style={{ width: `${share * 100}%` }} aria-hidden />}
                <span className="relative flex justify-between">
                  <span>{o}</span>
                  {voted && <span className="tabular font-semibold">{Math.round(share * 100)}%</span>}
                </span>
              </button>
            );
          })}
          <div className="text-[11px] text-[var(--color-ink-3)]">{totalVotes} voto{totalVotes === 1 ? "" : "s"}</div>
        </div>
      )}
      <div className="flex items-center gap-4 px-3 py-2">
        <button onClick={onLike} className="flex items-center gap-1.5 text-sm" aria-pressed={p.liked} aria-label={p.liked ? "Descurtir" : "Curtir"}>
          <Heart size={19} className={p.liked ? "fill-[var(--color-critical)] text-[var(--color-critical)]" : "text-[var(--color-ink-2)]"} />
          <span className="tabular">{p.likes}</span>
        </button>
        <span className="flex items-center gap-1.5 text-sm text-[var(--color-ink-2)]">
          <MessageCircle size={19} /> <span className="tabular">{p.comments.length}</span>
        </span>
      </div>
      {p.comments.length > 3 && !showAll && (
        <button className="px-3 text-xs text-[var(--color-ink-3)]" onClick={() => setShowAll(true)}>
          Ver os {p.comments.length} comentários
        </button>
      )}
      <ul className="space-y-1.5 px-3 pb-2">
        {comments.map((c) => (
          <li key={c.id} className="text-sm break-words">
            <span className="font-semibold">{c.author.nome}</span> <span className="text-[var(--color-ink-2)]">{c.texto}</span>
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2 border-t border-[var(--color-line)] p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!comment.trim()) return;
          onComment(comment.trim());
          setComment("");
        }}
      >
        <Avatar k={me.avatar} size={26} />
        <input className="input border-0 bg-transparent py-1.5 focus:shadow-none" placeholder="Comente…" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} aria-label="Comentário" />
        <button type="submit" className="text-sm font-semibold text-[var(--color-brand)] disabled:opacity-40" disabled={!comment.trim()}>
          Publicar
        </button>
      </form>
    </Card>
  );
}
