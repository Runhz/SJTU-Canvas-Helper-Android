import React, { useEffect, useRef, useState } from 'react';
import {
  Badge as RBadge,
  Button as RButton,
  IconButton as RIconButton,
  Tooltip as RTooltip,
} from '@radix-ui/themes';
import {
  ArrowUp,
  BookMarked,
  Check,
  ChevronDown,
  History,
  Maximize2,
  Minimize2,
  Paperclip,
  Plus,
  Quote,
  Settings2,
  Square,
  Sparkles,
  X,
  Trash2,
} from 'lucide-react';
import * as S from './services';
import { Empty, Markdown } from './ui';
import catalog from './learningSkills.json';
import { cleanAnswer } from './domain';
import { ImageMarkup } from './ImageMarkup';

function suggestions(text: string): string[] {
  try {
    return (
      JSON.parse(text.match(/<study_meta>([\s\S]*?)<\/study_meta>/)?.[1] || '{}').questions
        ?.filter((s: unknown) => typeof s === 'string')
        .slice(0, 3) || []
    );
  } catch {
    return [];
  }
}

export function Assistant({
  account,
  accountId,
  contextRequest,
  onContextUsed,
  onNotice,
  onSettings,
  onNote,
  onClose,
  wide,
  onWide,
  onResume,
}: {
  account: S.Account | null;
  accountId: string;
  contextRequest: S.ChatContext | null;
  onContextUsed: () => void;
  onNotice: (s: string) => void;
  onSettings: () => void;
  onNote: (note: S.Note) => void;
  onResume: (context: S.ChatContext, seconds: number, resource?: string) => void;
  onClose: () => void;
  wide: boolean;
  onWide: () => void;
}) {
  const [threads, setThreads] = useState<S.Thread[]>([]),
    [active, setActive] = useState(''),
    [history, setHistory] = useState(false),
    [ready, setReady] = useState(false);
  const [draft, setDraft] = useState(''),
    [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState(''),
    [skill, setSkill] = useState('auto');
  const [previewSkill, setPreviewSkill] = useState(false),
    [importing, setImporting] = useState(false),
    [saving, setSaving] = useState(false),
    [quote, setQuote] = useState(''),
    [draftImage, setDraftImage] = useState<string>(),
    [editingImage, setEditingImage] = useState(false);
  const request = useRef(''),
    generation = useRef(0),
    scroll = useRef<HTMLDivElement>(null),
    atBottom = useRef(true),
    input = useRef<HTMLTextAreaElement>(null),
    alive = useRef(true);
  const current = threads.find((t) => t.id === active),
    latest = current?.messages.filter((m) => m.role === 'assistant').at(-1);
  const latestThreads = useRef(threads);
  latestThreads.current = threads;

  useEffect(() => {
    alive.current = true;
    const ticket = ++generation.current;
    setReady(false);
    setThreads([]);
    setActive('');
    setDraft('');
    setBusy(false);
    if (!accountId) return;
    void S.listSaved<S.Thread>('threads', accountId)
      .then((list) => {
        if (ticket !== generation.current) return;
        const sorted = list.sort((a, b) => b.updated - a.updated);
        setThreads(sorted);
        setActive(sorted[0]?.id || '');
        setReady(true);
      })
      .catch((e) => {
        if (ticket === generation.current) {
          onNotice(S.errorText(e));
          setReady(true);
        }
      });
    return () => {
      alive.current = false;
      generation.current++;
      if (request.current) void S.call('cancel_ai', { requestId: request.current }).catch(() => {});
      void Promise.all(latestThreads.current.map((t) => S.putSaved('threads', t))).catch(() => {});
    };
  }, [accountId]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void Promise.all(threads.map((t) => S.putSaved('threads', t))).catch((e) =>
        onNotice(S.errorText(e))
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [threads, ready]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      void Promise.all(latestThreads.current.map((t) => S.putSaved('threads', t))).catch((e) =>
        onNotice(S.errorText(e))
      );
    }, 1800);
    return () => clearInterval(timer);
  }, [busy]);

  const create = (context: S.ChatContext = {}) => {
    const thread: S.Thread = {
      id: crypto.randomUUID(),
      account: accountId,
      title: context.title || '新对话',
      updated: Date.now(),
      messages: [],
      context,
    };
    setThreads((old) => [thread, ...old]);
    setActive(thread.id);
    setHistory(false);
    setDraft('');
    setDraftImage(undefined);
    atBottom.current = true;
    return thread;
  };

  useEffect(() => {
    if (!contextRequest || !ready || busy) return;
    const key = (c: S.ChatContext) => (c.file?.id ? `file:${c.file.id}` : c.resourceId || '');
    const match = key(contextRequest) && threads.find((t) => key(t.context) === key(contextRequest));
    if (match) {
      setThreads((old) =>
        old.map((t) => (t.id === match.id ? { ...t, context: { ...t.context, ...contextRequest } } : t))
      );
      setActive(match.id);
      setHistory(false);
    } else create(contextRequest);
    if (contextRequest.screenshot) setDraftImage(contextRequest.screenshot);
    onContextUsed();
    input.current?.focus();
  }, [contextRequest, ready, busy]);

  useEffect(() => {
    if (atBottom.current)
      scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'auto' });
  }, [current?.messages, phase]);

  function update(id: string, fn: (thread: S.Thread) => S.Thread) {
    setThreads((old) => old.map((t) => (t.id === id ? fn(t) : t)));
  }

  async function send(value = draft) {
    if (busy || importing || saving || !value.trim()) return;
    if (!account) {
      onNotice('请先连接 Canvas');
      onSettings();
      return;
    }
    if (!account.modelKey) {
      onSettings();
      onNotice('请先在设置中填写模型服务');
      return;
    }
    const thread = current || create(),
      question = value.trim(),
      id = thread.id,
      ticket = generation.current;
    const ctx = { ...thread.context, learningSkill: skill === 'auto' ? undefined : skill };
    const snapshot = { ...thread, context: ctx };
    const user: S.Message = {
      role: 'user',
      content: question,
      image: thread.messages.some((m) => m.image === ctx.screenshot) ? undefined : ctx.screenshot,
    };
    update(id, (t) => ({
      ...t,
      context: ctx,
      title: t.messages.length ? t.title : question.slice(0, 30),
      updated: Date.now(),
      messages: [...t.messages, user, { role: 'assistant', content: '' }],
    }));
    setDraft('');
    setDraftImage(undefined);
    setBusy(true);
    setPhase('正在准备资料…');
    atBottom.current = true;
    const req = crypto.randomUUID();
    request.current = req;
    let answer = '',
      reasoning = '';
    const publish = () => {
      if (ticket !== generation.current || !alive.current) return;
      update(id, (t) => ({
        ...t,
        messages: [
          ...t.messages.slice(0, -1),
          { role: 'assistant', content: answer, reasoning },
        ],
      }));
    };
    try {
      const result = await S.ask(
        snapshot,
        question,
        (chunk) => {
          answer += chunk;
          publish();
        },
        (p) => {
          if (ticket === generation.current) setPhase(p);
        },
        (chunk) => {
          reasoning += chunk;
          publish();
        },
        req
      );
      if (ticket !== generation.current) return;
      if (result) answer = result;
      publish();
      onNotice('AI 已回复');
      await S.putSaved('threads', {
        ...snapshot,
        title: thread.messages.length ? thread.title : question.slice(0, 30),
        updated: Date.now(),
        messages: [...thread.messages, user, { role: 'assistant', content: answer, reasoning }],
      });
    } catch (e) {
      if (ticket !== generation.current) return;
      const message = S.errorText(e);
      update(id, (t) => ({
        ...t,
        messages: [
          ...t.messages.slice(0, -1),
          {
            role: 'assistant',
            content: answer ? `${answer}\n\n> ${message}` : message,
            reasoning,
            failed: !answer,
          },
        ],
      }));
      if (!answer) setDraft(question);
    } finally {
      if (ticket === generation.current) {
        setBusy(false);
        setPhase('');
        request.current = '';
      }
    }
  }

  async function attach() {
    if (!account || !accountId) {
      onSettings();
      return;
    }
    setImporting(true);
    setPhase('选择资料…');
    try {
      const files = await S.pickFiles(true);
      if (!files.length) return;
      const docs: S.Doc[] = [];
      for (const file of files) {
        docs.push(await S.readImport(file.path, file.name, setPhase));
      }
      const thread = current || create();
      update(thread.id, (t) => ({
        ...t,
        context: {
          ...t.context,
          file: undefined,
          files: [...(t.context.files || []), ...(t.context.file ? [t.context.file] : [])],
          documents: [...(t.context.documents || []), ...docs].slice(-6),
        },
        updated: Date.now(),
      }));
      onNotice('资料已加入当前对话，后续追问可继续使用');
    } catch (e) {
      onNotice(S.errorText(e));
    } finally {
      setImporting(false);
      setPhase('');
    }
  }

  async function saveNote() {
    if (!current || !current.messages.some((m) => m.role === 'assistant' && !m.failed)) return;
    setSaving(true);
    try {
      let body = '';
      const result = await S.ask(
        current,
        '请将以上问答忠实提炼为学习笔记，保留关键结论、公式、成立条件、资料页码或视频时间、未解决疑问。只输出笔记正文，不添加追问建议。',
        (s) => {
          body += s;
        },
        () => {},
        () => {},
        crypto.randomUUID()
      );
      const note: S.Note = {
        id: crypto.randomUUID(),
        account: accountId,
        title: current.title,
        body: cleanAnswer(result || body),
        updated: Date.now(),
        source: current.context.title,
      };
      await S.putSaved('notes', note);
      onNote(note);
      onNotice('已提炼并保存到笔记');
    } catch (e) {
      onNotice(S.errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const selectedSkill = catalog.skills.find((s) => s.id === skill);

  async function pasteImage(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(event.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    try {
      const bitmap = await createImageBitmap(file),
        canvas = document.createElement('canvas'),
        scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const image = canvas.toDataURL('image/jpeg', 0.84);
      const thread = current || create();
      update(thread.id, (t) => ({ ...t, context: { ...t.context, screenshot: image } }));
      setDraftImage(image);
      onNotice('截图已加入，可和文字一起发送');
    } catch {
      onNotice('这张图片无法读取，请换一张截图');
    }
  }

  return (
    <section className={`assistant ${wide ? 'wide' : ''}`} aria-label="学习助手">
      <header className="assistant-header">
        <div className="assistant-title">
          <span className="assistant-symbol">
            <Sparkles size={17} strokeWidth={2} />
          </span>
          <div>
            <strong>学习助手</strong>
            <small>{account?.modelName || '在设置中配置模型'}</small>
          </div>
        </div>
        <div className="icon-group">
          <RTooltip content="历史对话">
            <RIconButton
              size="2"
              variant={history ? 'soft' : 'ghost'}
              color="gray"
              aria-label="历史对话"
              onClick={() => setHistory((v) => !v)}
            >
              <History size={17} />
            </RIconButton>
          </RTooltip>
          <RTooltip content="新对话">
            <RIconButton
              size="2"
              variant="ghost"
              color="gray"
              aria-label="新对话"
              disabled={busy}
              onClick={() => create()}
            >
              <Plus size={17} />
            </RIconButton>
          </RTooltip>
          <RTooltip content={wide ? '缩小助手' : '扩大助手'}>
            <RIconButton
              size="2"
              variant="ghost"
              color="gray"
              aria-label="切换助手宽度"
              onClick={onWide}
            >
              {wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </RIconButton>
          </RTooltip>
          <RTooltip content="收起助手">
            <RIconButton
              size="2"
              variant="ghost"
              color="gray"
              aria-label="收起助手"
              onClick={onClose}
            >
              <X size={17} />
            </RIconButton>
          </RTooltip>
        </div>
      </header>

      {history ? (
        <div className="chat-history">
          <div className="chat-history-header">
            <h3>历史对话</h3>
            <RBadge variant="soft" color="gray" size="1">
              {threads.length} 篇
            </RBadge>
          </div>
          {!threads.length && <Empty title="还没有对话" />}
          {threads.map((t) => (
            <div className={`history-item ${active === t.id ? 'selected' : ''}`} key={t.id}>
              <button
                disabled={busy}
                onClick={() => {
                  setActive(t.id);
                  setHistory(false);
                  setDraft('');
                  setDraftImage(undefined);
                  atBottom.current = true;
                }}
              >
                <strong>{t.title}</strong>
                <small>{new Date(t.updated).toLocaleString('zh-CN')}</small>
              </button>
              <RIconButton
                size="1"
                variant="ghost"
                color="ruby"
                aria-label={`删除对话 ${t.title}`}
                disabled={busy}
                onClick={() => {
                  if (!confirm('删除这段对话？')) return;
                  void S.deleteSaved('threads', t.id)
                    .then(() => {
                      setThreads((old) => old.filter((x) => x.id !== t.id));
                      if (active === t.id) setActive('');
                    })
                    .catch((e) => onNotice(S.errorText(e)));
                }}
              >
                <Trash2 size={14} />
              </RIconButton>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div
            className="conversation"
            ref={scroll}
            onScroll={(e) => {
              const node = e.currentTarget;
              atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
            }}
            onMouseUp={() => {
              const selected = window.getSelection()?.toString().trim();
              setQuote(
                selected &&
                  selected.length < 3000 &&
                  scroll.current?.contains(window.getSelection()?.anchorNode || null)
                  ? selected
                  : ''
              );
            }}
          >
            {!current?.messages.length && (
              <div className="assistant-welcome">
                <div className="welcome-symbol">
                  <Sparkles size={28} strokeWidth={1.75} />
                </div>
                <h2>把不懂的地方，问清楚。</h2>
                <p>选一份课件、圈定字幕，或直接开始提问。对话会保存在本机。</p>
                <div className="prompt-grid">
                  {['帮我理解这节课的核心概念', '用一个直观的例子讲解', '一步一步提示我解题'].map(
                    (s) => (
                      <button key={s} className="prompt-chip" onClick={() => setDraft(s)}>
                        <span>{s}</span>
                        <ArrowUp size={13} className="chip-arrow" />
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            {current?.messages.map((m, i) => (
              <article className={`message ${m.role} ${m.failed ? 'failed' : ''}`} key={i}>
                {m.image && <img className="message-image" src={m.image} alt="本次提问截图" />}
                {m.reasoning && (
                  <details className="reasoning">
                    <summary>
                      <div className="reasoning-summary-content">
                        <Sparkles size={13} />
                        <span>思考过程</span>
                      </div>
                      <RBadge variant="soft" color="gray" size="1">
                        {m.reasoning.length} 字
                      </RBadge>
                    </summary>
                    <Markdown text={m.reasoning} />
                  </details>
                )}
                {m.content ? (
                  <Markdown
                    text={cleanAnswer(m.content)}
                    onSeek={(seconds, resource) =>
                      current && onResume(current.context, seconds, resource)
                    }
                  />
                ) : (
                  busy && (
                    <span className="typing-dots">
                      <i />
                      <i />
                      <i />
                    </span>
                  )
                )}
                {m.role === 'assistant' && m.content && !busy && (
                  <div className="message-tools">
                    <RButton
                      size="1"
                      variant="ghost"
                      color="gray"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(cleanAnswer(m.content))
                          .then(() => onNotice('回答已复制'))
                          .catch(() => onNotice('复制失败，请选择文字复制'));
                      }}
                    >
                      复制
                    </RButton>
                    <RButton
                      size="1"
                      variant="ghost"
                      color="indigo"
                      onClick={() => setDraft('请继续讲解刚才的内容，补充推导和适用条件。')}
                    >
                      继续问
                    </RButton>
                  </div>
                )}
              </article>
            ))}
            {busy && (
              <div className="ai-phase" role="status">
                <span className="phase-indicator" />
                <span>{phase}</span>
              </div>
            )}
          </div>

          <div className="assistant-composer-area">
            {quote && (
              <div className="quote-action">
                <Quote size={13} className="quote-icon" />
                <span className="quote-text">{quote.slice(0, 65)}</span>
                <RButton
                  size="1"
                  variant="soft"
                  color="indigo"
                  onClick={() => {
                    setDraft((old) => `关于「${quote}」，${old}`);
                    setQuote('');
                    input.current?.focus();
                  }}
                >
                  引用追问
                </RButton>
                <RIconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  aria-label="取消引用"
                  onClick={() => setQuote('')}
                >
                  <X size={13} />
                </RIconButton>
              </div>
            )}

            {current &&
              (current.context.title ||
                current.context.documents?.length ||
                current.context.screenshot) && (
                <details className="context-details">
                  <summary>
                    <Paperclip size={13} />
                    <span>
                      {current.context.title ||
                        `${current.context.documents?.length || 0} 份资料`}
                    </span>
                    <ChevronDown size={13} className="context-chevron" />
                  </summary>
                  <p>
                    本轮参考：
                    {current.context.file?.name ||
                      current.context.documents?.map((d) => d.name).join('、') ||
                      '当前字幕或画面'}
                  </p>
                  {current.context.screenshot && (
                    <img
                      className="context-thumbnail"
                      src={current.context.screenshot}
                      alt="已保存的上下文截图"
                    />
                  )}
                  <button
                    className="context-clear-btn"
                    disabled={busy}
                    onClick={() => update(current.id, (t) => ({ ...t, context: {} }))}
                  >
                    移除资料上下文
                  </button>
                </details>
              )}

            {current?.context.resourceId && (
              <button
                className="text-button resume-button"
                onClick={() =>
                  onResume(current.context, current.context.positionSeconds || 0)
                }
              >
                继续看 {current.context.positionLabel} →
              </button>
            )}

            {!busy && latest && (
              <div className="followup-chips">
                {suggestions(latest.content).map((s) => (
                  <button key={s} className="followup-chip" onClick={() => setDraft(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {importing && <p className="ai-phase">{phase}</p>}

            <div className={`composer ${expanded ? 'expanded' : ''}`}>
              <div className="composer-entry">
                {draftImage && (
                  <div className="draft-image">
                    <button title="标记或裁切截图" onClick={() => setEditingImage(true)}>
                      <img src={draftImage} alt="待发送截图" />
                    </button>
                    <button
                      className="draft-image-remove"
                      aria-label="移除待发送截图"
                      onClick={() => {
                        setDraftImage(undefined);
                        if (current)
                          update(current.id, (t) => ({
                            ...t,
                            context: { ...t.context, screenshot: undefined },
                          }));
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
                <textarea
                  ref={input}
                  onPaste={(e) => void pasteImage(e)}
                  value={draft}
                  placeholder="输入问题，Shift+Enter 换行…"
                  aria-label="向 AI 提问"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
              </div>

              <div className="composer-tools">
                <div className="icon-group">
                  <RTooltip content="添加本机资料">
                    <RIconButton
                      size="2"
                      variant="ghost"
                      color="gray"
                      aria-label="添加资料"
                      disabled={busy || importing}
                      onClick={() => void attach()}
                    >
                      <Paperclip size={16} />
                    </RIconButton>
                  </RTooltip>
                  <RTooltip content={expanded ? '收起输入框' : '展开输入框'}>
                    <RIconButton
                      size="2"
                      variant="ghost"
                      color="gray"
                      aria-label={expanded ? '收起输入框' : '展开输入框'}
                      onClick={() => setExpanded((v) => !v)}
                    >
                      {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </RIconButton>
                  </RTooltip>
                </div>

                {busy ? (
                  <button
                    type="button"
                    className="send-button stop"
                    aria-label="停止生成"
                    onClick={() =>
                      void S.call('cancel_ai', { requestId: request.current }).catch((e) =>
                        onNotice(S.errorText(e))
                      )
                    }
                  >
                    <Square size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="send-button"
                    aria-label="发送问题"
                    disabled={!draft.trim() || importing || !ready}
                    onClick={() => void send()}
                  >
                    <ArrowUp size={18} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            </div>

            <div className="assistant-footer">
              <div className="skill-select">
                <select
                  aria-label="教学方式"
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                >
                  <option value="auto">自动选择教学方式</option>
                  {catalog.skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <RTooltip content="预览教学方式">
                  <RIconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label="预览教学方式"
                    onClick={() => setPreviewSkill((v) => !v)}
                  >
                    <Settings2 size={13} />
                  </RIconButton>
                </RTooltip>
              </div>
              <RButton
                variant="ghost"
                color="gray"
                size="1"
                disabled={busy || saving || !current?.messages.length}
                onClick={() => void saveNote()}
              >
                <BookMarked size={14} />
                <span>{saving ? '正在提炼…' : '存为笔记'}</span>
              </RButton>
            </div>

            {previewSkill && (
              <div className="skill-preview">
                <strong>{selectedSkill?.title || '自动选择'}</strong>
                <p>
                  {selectedSkill?.prompt ||
                    '根据问题选择讲解、提示、例题等教学方式，课件阅读规则随资料类型自动加入。'}
                </p>
                <RButton
                  size="1"
                  variant="soft"
                  color="indigo"
                  onClick={() => setPreviewSkill(false)}
                >
                  <Check size={14} />
                  <span>知道了</span>
                </RButton>
              </div>
            )}
          </div>
        </>
      )}

      {editingImage && draftImage && (
        <ImageMarkup
          image={draftImage}
          onClose={() => setEditingImage(false)}
          onSave={(image) => {
            setDraftImage(image);
            setEditingImage(false);
            if (current)
              update(current.id, (t) => ({ ...t, context: { ...t.context, screenshot: image } }));
          }}
        />
      )}
    </section>
  );
}
