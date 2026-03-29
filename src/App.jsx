import { useState, useCallback } from "react";

// ─── API Config ───────────────────────────────────────────────────────────────

const ARCTIC  = "https://arctic-shift.photon-reddit.com";
const PULLPUSH = "https://api.pullpush.io";
const REDDIT_BASE = "https://www.reddit.com";
const LIMIT = 100;

function buildUrls(username, type, { before, after } = {}) {
    const base = [`limit=${LIMIT}`, `sort=desc`, `author=${encodeURIComponent(username)}`];
    if (before) base.push(`before=${before}`);
    if (after)  base.push(`after=${after}`);
    const qs = base.join("&");

    return {
        arctic:   type === "posts"
            ? `${ARCTIC}/api/posts/search?${qs}`
            : `${ARCTIC}/api/comments/search?${qs}`,
        pullpush: type === "posts"
            ? `${PULLPUSH}/reddit/search/submission/?test&${qs}`
            : `${PULLPUSH}/reddit/search/comment/?test&${qs}`,
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(utc) {
    const s = Math.floor(Date.now() / 1000 - utc);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 365) return `${d}d ago`;
    return `${Math.floor(d / 365)}y ago`;
}

function fmtNum(n) {
    if (n == null) return "0";
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

function getPostThumbnail(post) {
    try {
        if (post.preview?.images?.length) {
            const src = post.preview.images[0].source?.url;
            if (src) return src.replace(/&amp;/g, "&");
        }
    } catch (_) {}
    try {
        if (post.media_metadata) {
            const first = Object.values(post.media_metadata)[0];
            if (first?.s?.u) return first.s.u.replace(/&amp;/g, "&");
        }
    } catch (_) {}
    const imageExts = ["jpg", "jpeg", "png", "gif"];
    if (post.url && imageExts.includes(post.url.split(".").pop()?.toLowerCase()))
        return post.url;
    return null;
}

function getCommentImage(comment) {
    try {
        if (comment.media_metadata) {
            const first = Object.values(comment.media_metadata)[0];
            if (first?.s?.u) return first.s.u.replace(/&amp;/g, "&");
        }
    } catch (_) {}
    return null;
}

/** Fetch one URL, return { data, ok } — never throws */
async function safeFetch(url) {
    try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return { data: [], ok: false };
        const json = await res.json();
        return { data: json?.data ?? [], ok: true };
    } catch {
        return { data: [], ok: false };
    }
}

/**
 * Fetch from both Arctic Shift and PullPush in parallel, merge and deduplicate by id.
 * Returns { items, sources } where sources = ["arctic"|"pullpush"]
 */
async function fetchBoth(username, type, pagination = {}) {
    const { arctic, pullpush } = buildUrls(username, type, pagination);
    const [arcticRes, pullpushRes] = await Promise.all([
        safeFetch(arctic),
        safeFetch(pullpush),
    ]);

    const seen = new Set();
    const merged = [];
    const sources = [];

    if (arcticRes.ok && arcticRes.data.length > 0) sources.push("Arctic Shift");
    if (pullpushRes.ok && pullpushRes.data.length > 0) sources.push("PullPush");

    // Interleave both lists, dedup by id, sort desc by created_utc
    [...arcticRes.data, ...pullpushRes.data].forEach((item) => {
        if (item.id && !seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
        }
    });

    merged.sort((a, b) => b.created_utc - a.created_utc);

    return { items: merged, sources };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconSearch = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
    </svg>
);

const IconArrowUp = () => (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 3l7 7H3l7-7z" />
    </svg>
);

const IconComment = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
    </svg>
);

const IconExternal = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
);

const IconSpinner = () => (
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
);

const IconReddit = () => (
    <svg className="w-7 h-7" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 0C4.478 0 0 4.478 0 10c0 5.523 4.478 10 10 10 5.523 0 10-4.477 10-10C20 4.478 15.523 0 10 0zm5.838 10.295c.039.211.06.428.06.648 0 3.31-3.854 5.993-8.607 5.993S.684 14.253.684 10.943c0-.22.021-.437.06-.648a1.44 1.44 0 01-.575-1.152 1.443 1.443 0 012.56-.912C3.768 7.46 5.39 6.8 7.226 6.762l.857-4.02a.384.384 0 01.453-.296l2.83.592a1.005 1.005 0 111.965.397 1.006 1.006 0 01-1.005 1.005 1.003 1.003 0 01-.964-.728l-2.515-.526-.763 3.576c1.8.055 3.397.717 4.44 1.76a1.443 1.443 0 012.554.928 1.44 1.44 0 01-.54 1.143zM6.977 11.38a1.006 1.006 0 100 2.011 1.006 1.006 0 000-2.01zm3.875 2.965c-.537.537-1.575.58-1.864.58-.29 0-1.328-.043-1.865-.58a.253.253 0 00-.358.357c.681.68 1.896.747 2.223.747.326 0 1.54-.067 2.222-.747a.254.254 0 00-.358-.357zm-.108-2.965a1.006 1.006 0 100 2.011 1.006 1.006 0 000-2.01z" />
    </svg>
);

const IconChevronLeft = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
);

const IconChevronRight = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
);

// ─── Post Card ────────────────────────────────────────────────────────────────

function PostCard({ post }) {
    const thumb = getPostThumbnail(post);
    const postUrl = `${REDDIT_BASE}${post.permalink}`;

    return (
        <a href={postUrl} target="_blank" rel="noopener noreferrer"
           className="group block bg-[#1a1a1b] border border-[#343536] rounded-lg overflow-hidden hover:border-[#818384] transition-all duration-150 hover:shadow-lg">
            <div className="flex">
                <div className="flex flex-col items-center justify-start gap-1 px-2.5 py-3 bg-[#161617] min-w-[44px]">
                    <IconArrowUp />
                    <span className="text-[11px] font-bold text-[#d7dadc] leading-none">{fmtNum(post.score)}</span>
                </div>
                <div className="flex flex-1 gap-3 p-3 min-w-0">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] text-[#818384] mb-1.5 flex-wrap">
                            <span className="font-medium text-[#d7dadc]">{post.subreddit_name_prefixed}</span>
                            <span>·</span>
                            <span>{timeAgo(post.created_utc)}</span>
                            {post.link_flair_text && (
                                <>
                                    <span>·</span>
                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[#272729] text-[#d7dadc] border border-[#343536]">
                    {post.link_flair_text}
                  </span>
                                </>
                            )}
                        </div>
                        <p className="text-sm font-medium text-[#d7dadc] leading-snug mb-1.5 group-hover:text-white transition-colors line-clamp-2">
                            {post.title}
                        </p>
                        {post.selftext && post.selftext !== "[deleted]" && post.selftext !== "[removed]" && (
                            <p className="text-[12px] text-[#818384] leading-relaxed line-clamp-2 mb-2">
                                {post.selftext}
                            </p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-[#818384]">
              <span className="flex items-center gap-1">
                <IconComment />
                  {fmtNum(post.num_comments)} comments
              </span>
                            {post.domain && !post.is_self && (
                                <span className="flex items-center gap-1 text-[#4fbdba] truncate max-w-[200px]">
                  <IconExternal />
                  <span className="truncate">{post.domain}</span>
                </span>
                            )}
                        </div>
                    </div>
                    {thumb && (
                        <div className="flex-shrink-0 w-[70px] h-[52px] rounded overflow-hidden bg-[#272729]">
                            <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy"
                                 onError={(e) => { e.target.style.display = "none"; }} />
                        </div>
                    )}
                </div>
            </div>
        </a>
    );
}

// ─── Comment Card ─────────────────────────────────────────────────────────────

function CommentCard({ comment }) {
    const threadId = comment.link_id?.split("_").pop();
    const url = `${REDDIT_BASE}${comment.permalink}`;
    const threadUrl = threadId ? `${REDDIT_BASE}/comments/${threadId}` : url;
    const img = getCommentImage(comment);

    return (
        <a href={url} target="_blank" rel="noopener noreferrer"
           className="group block bg-[#1a1a1b] border border-[#343536] rounded-lg overflow-hidden hover:border-[#818384] transition-all duration-150 hover:shadow-lg">
            <div className="flex">
                <div className="flex flex-col items-center justify-start gap-1 px-2.5 py-3 bg-[#161617] min-w-[44px]">
                    <IconArrowUp />
                    <span className="text-[11px] font-bold text-[#d7dadc] leading-none">{fmtNum(comment.score)}</span>
                </div>
                <div className="flex-1 p-3 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-[#818384] mb-1.5 flex-wrap">
                        <span className="font-medium text-[#d7dadc]">{comment.subreddit_name_prefixed}</span>
                        <span>·</span>
                        <span>{timeAgo(comment.created_utc)}</span>
                        <span>·</span>
                        <a href={threadUrl} target="_blank" rel="noopener noreferrer"
                           onClick={(e) => e.stopPropagation()}
                           className="text-[#4fbdba] hover:underline flex items-center gap-0.5">
                            view thread <IconExternal />
                        </a>
                    </div>
                    <p className="text-sm text-[#d7dadc] leading-relaxed line-clamp-4 group-hover:text-white transition-colors">
                        {comment.body || "(no content)"}
                    </p>
                    {img && (
                        <div className="mt-2 w-24 h-16 rounded overflow-hidden bg-[#272729]">
                            <img src={img} alt="" className="w-full h-full object-cover" loading="lazy"
                                 onError={(e) => { e.target.style.display = "none"; }} />
                        </div>
                    )}
                </div>
            </div>
        </a>
    );
}

// ─── Empty / Error ────────────────────────────────────────────────────────────

function EmptyState({ tab }) {
    return (
        <div className="text-center py-16 text-[#818384]">
            <p className="text-sm">No {tab} found for this user.</p>
        </div>
    );
}

function ErrorState({ message }) {
    return (
        <div className="text-center py-16">
            <p className="text-sm text-red-400">{message}</p>
        </div>
    );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

function TabBtn({ label, count, countIsPlus, active, onClick }) {
    return (
        <button onClick={onClick}
                className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${active ? "text-white" : "text-[#818384] hover:text-[#d7dadc]"}`}>
            {label}
            {count > 0 && (
                <span className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full ${active ? "bg-[#ff4500] text-white" : "bg-[#272729] text-[#818384]"}`}>
          {countIsPlus ? `${count}+` : count}
        </span>
            )}
            {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ff4500] rounded-t" />}
        </button>
    );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, hasPrev, hasNext, onPrev, onNext, loading, compact }) {
    if (!hasPrev && !hasNext) return null;
    return (
        <div className={`flex items-center justify-center gap-3 ${compact ? "mb-4" : "mt-6"}`}>
            <button onClick={onPrev} disabled={!hasPrev || loading}
                    className="flex items-center justify-center w-10 h-10 rounded-lg border border-[#343536] hover:border-[#818384] text-[#d7dadc] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <IconChevronLeft />
            </button>
            <span className="text-[12px] text-[#818384] min-w-[60px] text-center">
        {loading
            ? <span className="flex justify-center"><IconSpinner /></span>
            : `Page ${page}`}
      </span>
            <button onClick={onNext} disabled={!hasNext || loading}
                    className="flex items-center justify-center w-10 h-10 rounded-lg border border-[#343536] hover:border-[#818384] text-[#d7dadc] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <IconChevronRight />
            </button>
        </div>
    );
}

// ─── usePaginatedFetch ────────────────────────────────────────────────────────

function usePaginatedFetch(type) {
    const [items, setItems]       = useState([]);
    const [sources, setSources]   = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState(null);
    const [page, setPage]         = useState(1);
    const [pageStack, setPageStack] = useState([]); // [{firstUtc, lastUtc}]

    const _fetch = useCallback(async (username, pagination = {}) => {
        setLoading(true);
        setError(null);
        try {
            const { items: data, sources: srcs } = await fetchBoth(username, type, pagination);
            setItems(data);
            setSources(srcs);
            return data;
        } catch (err) {
            setError(err.message);
            setItems([]);
            return [];
        } finally {
            setLoading(false);
        }
    }, [type]);

    const reset = useCallback(async (username) => {
        setPage(1);
        setPageStack([]);
        const data = await _fetch(username);
        if (data.length > 0) {
            setPageStack([{ firstUtc: data[0].created_utc, lastUtc: data[data.length - 1].created_utc }]);
        }
        return data;
    }, [_fetch]);

    const goNext = useCallback(async (username) => {
        const current = pageStack[pageStack.length - 1];
        if (!current) return;
        const data = await _fetch(username, { before: current.lastUtc });
        if (data.length > 0) {
            setPageStack((prev) => [...prev, { firstUtc: data[0].created_utc, lastUtc: data[data.length - 1].created_utc }]);
            setPage((p) => p + 1);
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, [_fetch, pageStack]);

    const goPrev = useCallback(async (username) => {
        if (pageStack.length <= 1) return;
        const newStack = pageStack.slice(0, -1);
        const prevEntry = newStack[newStack.length - 2];
        const data = await _fetch(username, prevEntry ? { after: prevEntry.firstUtc } : {});
        if (data.length > 0) {
            newStack[newStack.length - 1] = { firstUtc: data[0].created_utc, lastUtc: data[data.length - 1].created_utc };
        }
        setPageStack(newStack);
        setPage((p) => p - 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, [_fetch, pageStack]);

    return { items, sources, loading, error, page, pageStack, reset, goNext, goPrev };
}

// ─── Main App ─────────────────────────────────────────────────────────────────

const TABS = ["posts", "comments"];

export default function App() {
    const [username, setUsername]     = useState("");
    const [query, setQuery]           = useState("");
    const [activeTab, setActiveTab]   = useState("posts");
    const [searched, setSearched]     = useState(false);
    const [initialLoading, setInitialLoading] = useState(false);

    const posts    = usePaginatedFetch("posts");
    const comments = usePaginatedFetch("comments");

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        const user = username.trim();
        if (!user) return;
        setQuery(user);
        setSearched(true);
        setInitialLoading(true);
        await Promise.all([posts.reset(user), comments.reset(user)]);
        setInitialLoading(false);
    }, [username, posts, comments]);

    const active = activeTab === "posts" ? posts : comments;

    // Combined sources label
    const allSources = [...new Set([...posts.sources, ...comments.sources])];

    return (
        <div className="min-h-screen bg-[#0d0d0d] text-[#d7dadc]" style={{ fontFamily: "'Sora', sans-serif" }}>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');`}</style>

            {/* Header */}
            <header className="border-b border-[#1c1c1d] bg-[#0d0d0d] sticky top-0 z-20">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
                    <button onClick={() => { setSearched(false); setUsername(""); setQuery(""); }}
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <img src="/bot.png" alt="logo" className="w-10 h-10 rounded-full object-cover" />
                        <span className="text-[22px] font-semibold tracking-tight text-white">
              reddit<span className="text-[#ff4500]">OSINT</span>
            </span>
                    </button>
                    <span className="ml-1 text-[11px] text-[#818384] border border-[#343536] rounded px-1.5 py-0.5">beta</span>
                </div>
            </header>

            {/* Search */}
            <div className={`max-w-3xl mx-auto px-4 transition-all duration-300 ${searched ? "pt-6" : "pt-56"}`}>
                {!searched && (
                    <div className="text-center mb-8">
                        <h1 className="font-bold text-white mb-2 tracking-tight whitespace-nowrap" style={{fontSize:"43px"}}>Reddit User Intelligence</h1>
                        <p className="text-sm text-[#cccccc]">View private accounts and deleted posts/comments from any user.</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex gap-2">
                    <div className="relative flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#cccccc] text-base font-medium select-none">u/</span>
                        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                               placeholder="username"
                               className="w-full bg-[#1a1a1b] border border-[#343536] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#818384] focus:outline-none focus:border-[#ff4500] transition-colors"
                               autoFocus />
                    </div>
                    <button type="submit" disabled={!username.trim() || initialLoading}
                            className="flex items-center gap-2 bg-[#ff4500] hover:bg-[#e03d00] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm px-5 py-2.5 rounded-lg transition-colors">
                        {initialLoading ? <IconSpinner /> : <IconSearch />}
                        {searched && (initialLoading ? "Searching…" : "Search")}
                    </button>
                </form>
            </div>

            {/* Results */}
            {searched && (
                <div className="max-w-3xl mx-auto px-4 mt-6 pb-16">

                    {/* Summary */}
                    {!initialLoading && (
                        <p className="text-[12px] text-[#818384] mb-4">
                            Results for <span className="text-[#ff4500] font-medium">u/{query}</span>
                            {allSources.length > 0 && (
                                <> · {allSources.map((src, i) => {
                                    const url = src === "Arctic Shift"
                                        ? "https://github.com/ArthurHeitmann/arctic_shift"
                                        : "https://pullpush.io/";
                                    return (
                                        <span key={src}>
                      {i > 0 && <span className="text-[#818384]"> + </span>}
                                            <a href={url} target="_blank" rel="noopener noreferrer"
                                               className="text-[#d7dadc] hover:text-white hover:underline transition-colors">
                        {src}
                      </a>
                    </span>
                                    );
                                })}</>
                            )}
                        </p>
                    )}

                    {/* Tabs + inline pagination */}
                    <div className="flex items-center border-b border-[#1c1c1d] mb-4">
                        <div className="flex flex-1">
                            {TABS.map((tab) => (
                                <TabBtn key={tab}
                                        label={tab.charAt(0).toUpperCase() + tab.slice(1)}
                                        count={tab === "posts" ? posts.items.length : comments.items.length}
                                        countIsPlus={tab === "posts" ? posts.items.length >= LIMIT : comments.items.length >= LIMIT}
                                        active={activeTab === tab}
                                        onClick={() => setActiveTab(tab)} />
                            ))}
                        </div>
                        {!initialLoading && !active.loading && active.items.length > 0 && (active.page > 1 || active.items.length >= LIMIT) && (
                            <div className="flex items-center gap-2 pb-2">
                                <button onClick={() => active.goPrev(query)} disabled={active.page <= 1 || active.loading}
                                        className="flex items-center justify-center w-7 h-7 rounded border border-[#343536] hover:border-[#818384] text-[#d7dadc] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                    <IconChevronLeft />
                                </button>
                                <span className="text-[11px] text-[#818384]">
                  {active.loading ? <IconSpinner /> : `Page ${active.page}`}
                </span>
                                <button onClick={() => active.goNext(query)} disabled={active.items.length < LIMIT || active.loading}
                                        className="flex items-center justify-center w-7 h-7 rounded border border-[#343536] hover:border-[#818384] text-[#d7dadc] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                    <IconChevronRight />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Archive notice */}
                    {!initialLoading && searched && (
                        <div className="text-[11px] text-[#818384] mb-3 leading-relaxed">
                            This archive updates <strong className="text-[#818384]">monthly</strong>. For newer activity,{" "}
                            <a
                                href={`https://www.reddit.com/search/?q=author%3A%22${query}%22&type=${activeTab}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#ff4500] hover:underline"
                            >
                                click here
                            </a>{" "}
                            to search Reddit directly.
                            <br />
                            <span className="text-[#5a5a5b]">Note: Doing so will not show deleted posts or comments.</span>
                        </div>
                    )}

                    {/* Tab content */}
                    {initialLoading || active.loading ? (
                        <div className="flex items-center justify-center py-20 gap-3 text-[#818384]">
                            <IconSpinner />
                            <span className="text-sm">Fetching from Arctic Shift + PullPush…</span>
                        </div>
                    ) : active.error ? (
                        <ErrorState message={active.error} />
                    ) : active.items.length === 0 ? (
                        <EmptyState tab={activeTab} />
                    ) : (
                        <>
                            <div className="flex flex-col gap-2">
                                {activeTab === "posts" && posts.items.map((post) => (
                                    <PostCard key={post.id} post={post} />
                                ))}
                                {activeTab === "comments" && comments.items.map((comment) => (
                                    <CommentCard key={comment.id} comment={comment} />
                                ))}
                            </div>

                            <Pagination
                                page={active.page}
                                hasPrev={active.page > 1}
                                hasNext={active.items.length >= LIMIT}
                                onPrev={() => active.goPrev(query)}
                                onNext={() => active.goNext(query)}
                                loading={active.loading}
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}