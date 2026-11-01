import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge as RBadge,
  Button as RButton,
  Card as RCard,
  IconButton as RIconButton,
  Kbd as RKbd,
  SegmentedControl as RSegmentedControl,
  Tabs as RTabs,
  TextField as RTextField,
  Tooltip as RTooltip,
} from '@radix-ui/themes';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Home,
  Library,
  Loader2,
  LogIn,
  MessageCircle,
  NotebookPen,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Video,
  X,
  FileCheck2,
  Clock,
  Layers,
  LucideIcon,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import * as S from './services';
import { Assistant } from './Assistant';
import { Player } from './Player';
import { WaterCube } from './WaterCube';
import { Back, Empty, ErrorNotice, Loading, Markdown } from './ui';
import { currentTerm as selectCurrentTerm } from './domain';

type View = 'home' | 'courses' | 'recordings' | 'live' | 'materials' | 'assignments' | 'notes' | 'downloads';
const nav = [
  ['home', '总览', Home],
  ['courses', '课程', BookOpen],
  ['recordings', '课堂', Video],
  ['live', '直播', Radio],
  ['materials', '资料库', Library],
  ['assignments', '作业', FileText],
  ['notes', '笔记', NotebookPen],
  ['downloads', '下载', Download],
] as const;
const labels = Object.fromEntries(nav.map(([key, label]) => [key, label]));
const today = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

function useResource<T>(key: string, fetcher: () => Promise<T>, enabled = true) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setData(undefined);
      setError('');
      return;
    }
    let cancelled = false;
    setData(undefined);
    setBusy(true);
    setError('');
    void fetcher()
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((e) => {
        if (!cancelled) setError(S.errorText(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, retry, enabled]);
  return { data, error, busy, reload: () => setRetry((v) => v + 1) };
}

export function DesktopApp() {
  const [view, setView] = useState<View>('home'),
    [settings, setSettings] = useState<S.Settings>({ currentId: '', accounts: [] }),
    [account, setAccount] = useState<S.Account | null>(null),
    [identity, setIdentity] = useState('');
  const [courses, setCourses] = useState<S.Course[]>([]),
    [assignments, setAssignments] = useState<S.Assignment[]>([]),
    [assignmentError, setAssignmentError] = useState(''),
    [assignmentBusy, setAssignmentBusy] = useState(false);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [queries, setQueries] = useState<Partial<Record<View, string>>>({}),
    [term, setTerm] = useState('current'),
    [courseId, setCourseId] = useState(0),
    [detail, setDetail] = useState(false);
  const [selectedFile, setSelectedFile] = useState<S.CourseFile | null>(null),
    [selectedAssignment, setSelectedAssignment] = useState<S.Assignment | null>(null),
    [recording, setRecording] = useState<S.Recording | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false),
    [assistantOpen, setAssistantOpen] = useState(false),
    [assistantWide, setAssistantWide] = useState(false),
    [context, setContext] = useState<S.ChatContext | null>(null),
    [toast, setToast] = useState(''),
    [notesVersion, setNotesVersion] = useState(0),
    [celebrate, setCelebrate] = useState(false);
  const [refresh, setRefresh] = useState(0),
    [sidebarSmall, setSidebarSmall] = useState(false);
  const [seekRequest, setSeekRequest] = useState<{ seconds: number; nonce: number }>();
  const query = queries[view] || '';
  const setQuery = (value: string) => setQueries((old) => ({ ...old, [view]: value }));
  const [assistantWidth, setAssistantWidth] = useState<number>();
  const resizeAssistant = useRef<{ x: number; width: number; current: number }>();
  const generation = useRef(0),
    latestSettings = useRef(settings);
  const notice = (text: string) => setToast(text);

  useEffect(() => {
    latestSettings.current = settings;
  }, [settings]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!celebrate) return;
    const timer = setTimeout(() => setCelebrate(false), 3200);
    return () => clearTimeout(timer);
  }, [celebrate]);

  async function activate(config: S.Account) {
    const ticket = ++generation.current;
    setLoading(true);
    setError('');
    setAccount(null);
    setIdentity('');
    setCourses([]);
    setAssignments([]);
    setRecording(null);
    setSelectedFile(null);
    setSelectedAssignment(null);
    setCourseId(0);
    setDetail(false);
    setTerm('current');
    setContext(null);
    try {
      await S.restore(config);
      const key = await S.accountKey(config);
      if (ticket !== generation.current) return;
      setAccount(config);
      setIdentity(key);
      const loaded = await S.api<S.Course[]>('courses');
      if (ticket !== generation.current) return;
      setCourses(
        loaded.map((c) => ({
          ...c,
          name: c.name || c.course_code || '未命名课程',
          teachers: c.teachers || [],
          term: c.term || { id: 0, name: '未标注学期' },
        }))
      );
    } catch (e) {
      if (ticket === generation.current) setError(S.errorText(e));
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    void S.loadSettings()
      .then((value) => {
        if (!alive) return;
        setSettings(value);
        const saved = value.accounts.find((a) => a.accountId === value.currentId);
        if (saved) return activate(saved);
        setLoading(false);
      })
      .catch((e) => {
        if (alive) {
          setError(S.errorText(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      generation.current++;
    };
  }, []);

  const terms = useMemo(
    () =>
      Array.from(new Map(courses.map((c) => [c.term.id, c.term])).values()).sort(
        (a, b) => (b.start_at || '').localeCompare(a.start_at || '') || b.id - a.id
      ),
    courses
  );
  const currentTerm = selectCurrentTerm(terms);
  const scope = useMemo(
    () =>
      courses.filter(
        (c) => term === 'all' || c.term.id === Number(term === 'current' ? currentTerm : term)
      ),
    [courses, term, currentTerm]
  );
  const course = scope.find((c) => c.id === courseId);
  const found = scope.filter((c) =>
    S.matches(`${c.name} ${c.course_code} ${c.teachers.map((t) => t.display_name).join(' ')}`, query)
  );

  useEffect(() => {
    if (!account || !scope.length) {
      setAssignments([]);
      return;
    }
    const ticket = generation.current;
    let active = true;
    setAssignmentBusy(true);
    setAssignmentError('');
    void S.mapLimited(scope, 3, async (c) => ({
      course: c.id,
      items: (await S.api<Omit<S.Assignment, 'courseId'>[]>('assignments', { courseId: c.id })).map(
        (a) => ({ ...a, courseId: c.id })
      ),
    }))
      .then((results) => {
        if (!active || ticket !== generation.current) return;
        const good = results.filter(
          (r): r is PromiseFulfilledResult<{ course: number; items: S.Assignment[] }> =>
            r.status === 'fulfilled'
        );
        const successful = new Set(good.map((r) => r.value.course));
        const allowed = new Set(scope.map((c) => c.id));
        setAssignments((previous) => [
          ...previous.filter((a) => allowed.has(a.courseId) && !successful.has(a.courseId)),
          ...good.flatMap((r) => r.value.items),
        ]);
        const failed = results.length - good.length;
        if (failed) setAssignmentError(`${failed} 门课程的作业未能读取，当前统计可能不完整。`);
      })
      .finally(() => {
        if (active) setAssignmentBusy(false);
      });
    return () => {
      active = false;
    };
  }, [scope, account?.accountId, refresh]);

  useEffect(() => {
    if (courseId && !scope.some((c) => c.id === courseId)) {
      setCourseId(0);
      setDetail(false);
      setSelectedFile(null);
    }
  }, [scope, courseId]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('workspace-search')?.focus();
      }
      if (e.key === 'Escape') {
        setSettingsOpen(false);
        if (selectedFile) setSelectedFile(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selectedFile]);

  function navigate(next: View) {
    setView(next);
  }

  function choose(c: S.Course, next: View = 'courses') {
    if (c.id !== courseId) {
      setSelectedFile(null);
      setSelectedAssignment(null);
    }
    if (next === 'recordings' && recording?.courseId !== c.id) setRecording(null);
    setCourseId(c.id);
    setView(next);
    setDetail(next === 'courses');
    setQueries((old) => ({ ...old, [next]: '' }));
  }

  function resume(ctx: S.ChatContext, seconds: number, resource = ctx.resourceId) {
    if (!resource || !ctx.courseId || !Number.isFinite(seconds) || seconds < 0) return;
    const colon = resource.indexOf(':');
    const source = resource.slice(0, colon) as S.Recording['source'],
      videoId = resource.slice(colon + 1);
    if (!['canvas', 'videoSpace', 'legacy'].includes(source) || !videoId) {
      notice('引用的课堂标识无效');
      return;
    }
    setView('recordings');
    setSeekRequest({ seconds, nonce: Date.now() });
    setRecording({
      videoId,
      source,
      courseId: ctx.courseId,
      courseName: courses.find((c) => c.id === ctx.courseId)?.name || '课堂',
      videoName: ctx.title || '课堂录播',
      playable: true,
      availabilityLabel: '',
      courseBeginTime: '',
    });
  }

  const ask = (ctx: S.ChatContext) => {
    setContext(ctx);
    setAssistantOpen(true);
  };
  const run = (promise: Promise<unknown>) => void promise.catch((e) => notice(S.errorText(e)));
  const pending = assignments.filter((a) => !S.submitted(a)),
    done = assignments.length - pending.length;
  const courseName = (id: number) => courses.find((c) => c.id === id)?.name || '课程';

  async function saveAccount(config: S.Account, validate: boolean) {
    if (validate) await S.connect(config);
    else await S.restore(config);
    const previous = latestSettings.current;
    const next = {
      currentId: config.accountId,
      accounts: [...previous.accounts.filter((a) => a.accountId !== config.accountId), config],
    };
    await S.saveSettings(next);
    setSettings(next);
    if (account?.accountId === config.accountId && account.token === config.token) {
      setAccount(config);
    } else {
      await activate(config);
    }
    notice('配置已保存');
  }

  return (
    <div className={`desktop-shell ${sidebarSmall ? 'sidebar-collapsed' : ''}`}>
      <aside className="desktop-sidebar">
        <button className="desktop-brand" onClick={() => navigate('home')} title="学习总览">
          <span className="brand-mark">
            <span />
          </span>
          <div className="brand-text">
            <strong>Canvas 随行</strong>
            <small>DESKTOP WORKSPACE</small>
          </div>
        </button>

        <div className="workspace-label">
          <span className={account ? 'status-dot online' : 'status-dot'} />
          <span>{account?.accountId || '个人学习空间'}</span>
        </div>

        <nav aria-label="主导航">
          {nav.map(([id, label, Icon]) => (
            <button
              title={label}
              className={`nav-item ${view === id ? 'active' : ''}`}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={18} strokeWidth={2} />
              <span>{label}</span>
              {id === 'live' && (
                <span className="nav-live-pill">
                  <span className="live-dot" />
                  <span>LIVE</span>
                </span>
              )}
              {id === 'assignments' && pending.length > 0 && (
                <RBadge color="indigo" variant="soft" size="1" className="nav-badge">
                  {pending.length}
                </RBadge>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            className={`sidebar-assistant ${assistantOpen ? 'active' : ''}`}
            onClick={() => setAssistantOpen((v) => !v)}
            title="学习助手 (AI)"
          >
            <Sparkles size={17} strokeWidth={2} />
            <span>学习助手</span>
            <span className="key-hint">AI</span>
          </button>
          <button onClick={() => setSettingsOpen(true)} title="设置与连接">
            <Settings2 size={17} strokeWidth={2} />
            <span>设置与连接</span>
          </button>
          <button
            title={sidebarSmall ? '展开导航' : '收起导航'}
            onClick={() => setSidebarSmall((v) => !v)}
          >
            <ChevronRight className={sidebarSmall ? '' : 'rotate'} size={17} strokeWidth={2} />
            <span>收起导航</span>
          </button>
          <div className="sidebar-footnote">Windows · 1.0.0</div>
        </div>
      </aside>

      <div className="desktop-body">
        <header className="desktop-topbar">
          <div className="breadcrumbs">
            <span>学习空间</span>
            <ChevronRight size={13} />
            <strong>{labels[view]}</strong>
            {course && detail && (
              <>
                <ChevronRight size={13} />
                <span className="breadcrumb-course">{course.name}</span>
              </>
            )}
          </div>
          <div className="top-actions">
            <RTooltip content={view === 'live' ? '当前正在观看内嵌直播' : '打开官方课堂直播 (内嵌播放)'}>
              <RButton
                variant={view === 'live' ? 'solid' : 'soft'}
                color={view === 'live' ? 'indigo' : 'gray'}
                size="2"
                className={`top-btn ${view === 'live' ? 'top-btn-live active' : 'top-btn-live'}`}
                onClick={() => navigate('live')}
              >
                <span className="live-dot" />
                <span>课堂直播</span>
              </RButton>
            </RTooltip>
            <RTooltip content="开启 / 收起学习助手侧栏">
              <RButton
                variant={assistantOpen ? 'solid' : 'soft'}
                color="indigo"
                size="2"
                className="top-btn"
                onClick={() => setAssistantOpen((v) => !v)}
              >
                <Sparkles size={15} />
                <span>学习助手</span>
              </RButton>
            </RTooltip>
          </div>
        </header>

        <div className="workspace-body">
          <main className={`desktop-main ${view === 'recordings' && recording ? 'watching' : ''}`}>
            {loading && <Loading label="正在连接你的课程空间…" />}
            {error && (
              <ErrorNotice
                message={error}
                onRetry={() => (account ? run(activate(account)) : setSettingsOpen(true))}
              />
            )}
            {!loading && !account && (
              <div className="connection-welcome">
                <div className="welcome-art">
                  <BookOpen size={36} strokeWidth={1.75} />
                </div>
                <p className="eyebrow">你的 Windows 学习空间</p>
                <h1>课程、思考与笔记，在同一张桌面。</h1>
                <p>
                  连接 Canvas 后，课程与作业从平台读取。打开课堂时，课件和 AI 可以留在身边。
                </p>
                <div className="welcome-actions">
                  <RButton
                    size="3"
                    variant="solid"
                    color="indigo"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <LogIn size={17} />
                    <span>连接 Canvas</span>
                  </RButton>
                  <RButton
                    size="3"
                    variant="soft"
                    color="gray"
                    onClick={() => run(S.portal('live'))}
                  >
                    <span>先打开官方课堂</span>
                    <ArrowUpRight size={15} />
                  </RButton>
                </div>
              </div>
            )}

            {account && !loading && (
              <>
                <div className="page-controls">
                  <div className="term-select">
                    <CalendarDays size={15} />
                    <select
                      aria-label="选择学期"
                      value={term}
                      onChange={(e) => {
                        setTerm(e.target.value);
                        setSelectedFile(null);
                        setSelectedAssignment(null);
                      }}
                    >
                      <option value="current">
                        {terms.find((t) => t.id === currentTerm)?.name || '当前学期'}
                      </option>
                      <option value="all">全部学期</option>
                      {terms
                        .filter((t) => t.id !== currentTerm)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name || '未标注学期'}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="desktop-search-container">
                    <RTextField.Root
                      size="2"
                      placeholder={view === 'notes' ? '搜索笔记…' : '搜索当前列表…'}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      id="workspace-search"
                      className="desktop-search-input"
                    >
                      <RTextField.Slot>
                        <Search size={14} className="search-slot-icon" />
                      </RTextField.Slot>
                      {query && (
                        <RTextField.Slot>
                          <RIconButton
                            size="1"
                            variant="ghost"
                            color="gray"
                            aria-label="清空搜索"
                            onClick={() => setQuery('')}
                          >
                            <X size={12} />
                          </RIconButton>
                        </RTextField.Slot>
                      )}
                      <RTextField.Slot>
                        <RKbd size="1">Ctrl K</RKbd>
                      </RTextField.Slot>
                    </RTextField.Root>
                  </div>

                  <RTooltip content="刷新课程和作业">
                    <RIconButton
                      size="2"
                      variant="soft"
                      color="gray"
                      aria-label="刷新课程和作业"
                      onClick={() => {
                        setRefresh((v) => v + 1);
                        void S.api<S.Course[]>('courses')
                          .then(setCourses)
                          .catch((e) => notice(S.errorText(e)));
                      }}
                    >
                      <RefreshCw size={15} />
                    </RIconButton>
                  </RTooltip>
                </div>

                {view === 'home' && (
                  <div className="desktop-content">
                    <div className="welcome-row">
                      <div>
                        <p className="eyebrow">今天，继续向前一点</p>
                        <h1>你的学习，一目了然。</h1>
                        <p className="muted">
                          {today.format(new Date())} · {scope.length} 门课程
                        </p>
                      </div>
                      <RButton
                        variant="soft"
                        color="gray"
                        size="2"
                        onClick={() => navigate('assignments')}
                      >
                        <span>查看作业</span>
                        <ArrowRight size={14} />
                      </RButton>
                    </div>

                    <div className="overview-grid">
                      <section className="overview-main">
                        <div className="metric-grid">
                          <Metric
                            label="待完成作业"
                            value={assignmentBusy ? '…' : pending.length}
                            detail="按当前学期读取"
                            icon={Clock}
                            color="amber"
                          />
                          <Metric
                            label="已完成作业"
                            value={assignmentBusy ? '…' : done}
                            detail={assignmentError ? '部分课程未读取' : '依据平台提交记录'}
                            icon={FileCheck2}
                            color="teal"
                          />
                          <Metric
                            label="本学期课程"
                            value={scope.length}
                            detail="来自 Canvas"
                            icon={Layers}
                            color="indigo"
                          />
                        </div>
                        {assignmentError && (
                          <ErrorNotice
                            message={assignmentError}
                            onRetry={() => setRefresh((v) => v + 1)}
                          />
                        )}

                        <div className="section-title">
                          <h2>近期截止</h2>
                          <button className="text-button" onClick={() => navigate('assignments')}>
                            <span>全部作业</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                        <div className="deadline-list">
                          {pending
                            .filter((a) => a.due_at)
                            .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))
                            .slice(0, 4)
                            .map((a) => (
                              <button
                                key={`${a.courseId}:${a.id}`}
                                className="deadline-row"
                                onClick={() => {
                                  setView('assignments');
                                  setSelectedAssignment(a);
                                }}
                              >
                                <span className="deadline-icon">
                                  <FileText size={18} />
                                </span>
                                <div className="deadline-content">
                                  <strong>{a.name}</strong>
                                  <small>{courseName(a.courseId)}</small>
                                </div>
                                <Due value={a.due_at} />
                                <ChevronRight size={15} className="deadline-arrow" />
                              </button>
                            ))}
                          {!pending.some((a) => a.due_at) && (
                            <Empty
                              title={assignmentBusy ? '正在同步截止日期' : '当前没有有截止日期的待办'}
                              description="未设截止时间的作业可以在作业页查看。"
                            />
                          )}
                        </div>
                      </section>

                      <section className="water-panel">
                        <div className="section-title">
                          <div>
                            <p className="eyebrow">让进度慢慢积累</p>
                            <h2>片刻涟漪</h2>
                          </div>
                          <RBadge variant="soft" color="cyan" size="1">
                            GPU 水面模拟
                          </RBadge>
                        </div>
                        <WaterCube completed={done} total={assignments.length} />
                        <p className="water-tip">点按泛起涟漪，按住拖动搅动水面。</p>
                      </section>
                    </div>

                    <div className="section-title section-title-spacing">
                      <h2>打开一门课</h2>
                      <button className="text-button" onClick={() => navigate('courses')}>
                        <span>全部课程</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                    <div className="course-grid">
                      {found.slice(0, 6).map((c, i) => (
                        <CourseCard key={c.id} course={c} index={i} onOpen={() => choose(c)} />
                      ))}
                    </div>
                    {!found.length && (
                      <Empty
                        title={query ? '没有匹配课程' : '这个学期暂无可见课程'}
                        description="可以切换学期，或检查 Canvas 账号。"
                      />
                    )}
                  </div>
                )}

                {view === 'courses' && (
                  <div className="desktop-content">
                    {detail && course ? (
                      <>
                        <div className="workspace-title">
                          <Back onClick={() => setDetail(false)} label="全部课程" />
                          <div>
                            <p className="eyebrow">{course.course_code}</p>
                            <h1>{course.name}</h1>
                            <p className="muted">
                              {course.teachers.map((t) => t.display_name).join('、') ||
                                '教师信息未提供'}
                            </p>
                          </div>
                          <RButton
                            variant="soft"
                            color="gray"
                            size="2"
                            onClick={() => run(S.portal('course', course.id))}
                          >
                            <ExternalLink size={15} />
                            <span>官方课程</span>
                          </RButton>
                        </div>
                        <div className="course-actions">
                          <RButton
                            variant="soft"
                            color="indigo"
                            size="2"
                            onClick={() => choose(course, 'recordings')}
                          >
                            <Video size={16} />
                            <span>课堂录播</span>
                          </RButton>
                          <RButton
                            variant="soft"
                            color="indigo"
                            size="2"
                            onClick={() => choose(course, 'assignments')}
                          >
                            <FileText size={16} />
                            <span>课程作业</span>
                          </RButton>
                          <RButton
                            variant="soft"
                            color="indigo"
                            size="2"
                            onClick={() =>
                              ask({
                                title: course.name,
                                text: `当前课程：${course.name}。课程编号：${course.course_code}。`,
                              })
                            }
                          >
                            <Sparkles size={16} />
                            <span>问 AI</span>
                          </RButton>
                        </div>
                        <FileLibrary
                          key={`${identity}:${course.id}`}
                          course={course}
                          query={query}
                          selected={selectedFile}
                          onSelect={setSelectedFile}
                          onAsk={ask}
                          notice={notice}
                        />
                      </>
                    ) : (
                      <>
                        <PageTitle
                          eyebrow="按课程整理"
                          title="我的课程"
                          count={`${found.length} 门`}
                        />
                        <div className="course-grid">
                          {found.map((c, i) => (
                            <CourseCard
                              key={c.id}
                              course={c}
                              index={i}
                              onOpen={() => choose(c)}
                            />
                          ))}
                        </div>
                        {!found.length && <Empty title="未找到课程" />}
                      </>
                    )}
                  </div>
                )}

                {(view === 'materials' || view === 'recordings' || view === 'assignments') &&
                  !(view === 'recordings' && recording) && (
                    <div className="desktop-content">
                      <PageTitle
                        eyebrow={
                          view === 'recordings'
                            ? '把课堂带回桌面'
                            : view === 'materials'
                            ? '课件与阅读'
                            : '掌握每一个截止日期'
                        }
                        title={labels[view]}
                      />
                      <div className="course-scope">
                        <BookOpen size={16} />
                        <select
                          aria-label="选择课程"
                          value={courseId}
                          onChange={(e) => {
                            setCourseId(Number(e.target.value));
                            setSelectedFile(null);
                            setSelectedAssignment(null);
                          }}
                        >
                          <option value={0}>
                            {view === 'assignments' ? '全部课程' : '请选择课程'}
                          </option>
                          {scope.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        {view === 'recordings' && (
                          <RButton
                            variant="soft"
                            color="gray"
                            size="1"
                            onClick={() => run(S.portal('login'))}
                          >
                            <LogIn size={14} />
                            <span>官方登录</span>
                          </RButton>
                        )}
                      </div>
                      {view === 'materials' &&
                        (course ? (
                          <FileLibrary
                            key={`${identity}:${course.id}`}
                            course={course}
                            query={query}
                            selected={selectedFile}
                            onSelect={setSelectedFile}
                            onAsk={ask}
                            notice={notice}
                          />
                        ) : (
                          <Empty
                            title="先选一门课程"
                            description="资料按课程和学期整理，选择后即可预览与提问。"
                          />
                        ))}
                      {view === 'recordings' &&
                        (course ? (
                          <RecordingLibrary
                            key={`${identity}:${course.id}`}
                            course={course}
                            query={query}
                            onPlay={(r) => {
                              setSeekRequest(undefined);
                              setRecording(r);
                            }}
                            onNotice={notice}
                            onLogin={() => setSettingsOpen(true)}
                          />
                        ) : (
                          <Empty
                            title="选择你想看的课堂"
                            description="支持机位切换、字幕提问、课件切片和观看进度保存。"
                          />
                        ))}
                      {view === 'assignments' && (
                        <>
                          {assignmentBusy && <Loading label="正在读取各课程作业…" />}
                          {assignmentError && (
                            <ErrorNotice
                              message={assignmentError}
                              onRetry={() => setRefresh((v) => v + 1)}
                            />
                          )}
                          <Assignments
                            items={assignments.filter(
                              (a) =>
                                (!courseId || a.courseId === courseId) &&
                                S.matches(`${a.name} ${courseName(a.courseId)}`, query)
                            )}
                            courseName={courseName}
                            selected={selectedAssignment}
                            onSelect={setSelectedAssignment}
                            onAsk={ask}
                            notice={notice}
                            onSubmitted={() => {
                              setSelectedAssignment(null);
                              setRefresh((v) => v + 1);
                              setCelebrate(true);
                            }}
                          />
                        </>
                      )}
                    </div>
                  )}

                {view === 'notes' && (
                  <Notes
                    key={identity}
                    accountId={identity}
                    version={notesVersion}
                    query={query}
                    onAsk={ask}
                    notice={notice}
                  />
                )}
                {view === 'downloads' && <Downloads query={query} notice={notice} />}
                {view === 'live' && <LiveWorkspace onNotice={notice} onAsk={ask} />}
                {recording && (
                  <div
                    className={
                      view === 'recordings' ? 'desktop-content player-content' : 'view-hidden'
                    }
                  >
                    <Player
                      key={`${identity}:${recording.source}:${recording.videoId}`}
                      recording={recording}
                      accountId={identity}
                      visible={view === 'recordings'}
                      seekRequest={seekRequest}
                      onBack={() => setRecording(null)}
                      onAsk={ask}
                      onNotice={notice}
                    />
                  </div>
                )}
              </>
            )}
          </main>

          <div
            className={`assistant-slot ${assistantOpen ? 'open' : ''} ${
              assistantWide ? 'expanded' : ''
            }`}
            style={assistantWidth ? { width: assistantWidth } : undefined}
          >
            <div
              className="assistant-resizer"
              role="separator"
              aria-label="拖动调整助手宽度"
              aria-orientation="vertical"
              onPointerDown={(e) => {
                const width = e.currentTarget.parentElement!.clientWidth;
                resizeAssistant.current = { x: e.clientX, width, current: width };
                e.currentTarget.setPointerCapture(e.pointerId);
                document.body.style.userSelect = 'none';
              }}
              onPointerMove={(e) => {
                const start = resizeAssistant.current;
                if (!start) return;
                start.current = Math.min(
                  window.innerWidth * 0.65,
                  Math.max(320, start.width + start.x - e.clientX)
                );
                e.currentTarget.parentElement!.style.width = `${start.current}px`;
              }}
              onPointerUp={() => {
                if (resizeAssistant.current) setAssistantWidth(resizeAssistant.current.current);
                resizeAssistant.current = undefined;
                document.body.style.userSelect = '';
              }}
              onPointerCancel={() => {
                resizeAssistant.current = undefined;
                document.body.style.userSelect = '';
              }}
            />
            <Assistant
              key={identity || 'offline'}
              account={account}
              accountId={identity}
              contextRequest={context}
              onContextUsed={() => setContext(null)}
              onNotice={notice}
              onSettings={() => setSettingsOpen(true)}
              onResume={resume}
              onNote={() => setNotesVersion((v) => v + 1)}
              onClose={() => setAssistantOpen(false)}
              wide={assistantWide}
              onWide={() => {
                setAssistantWidth(undefined);
                setAssistantWide((v) => !v);
              }}
            />
          </div>
        </div>
      </div>

      {settingsOpen && (
        <SettingsDialog
          account={account}
          saved={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={saveAccount}
          notice={notice}
        />
      )}
      {toast && (
        <div className="desktop-toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {celebrate && (
        <div className="celebration" onClick={() => setCelebrate(false)}>
          <div className="celebration-mark">
            <Check size={40} />
          </div>
          <h2>提交完成</h2>
          <p>又向前走了一步。</p>
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  color = 'indigo',
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  icon?: LucideIcon;
  color?: 'indigo' | 'teal' | 'amber';
}) {
  return (
    <RCard variant="surface" className={`metric-card metric-${color}`}>
      <div className="metric-header">
        <span>{label}</span>
        {Icon && (
          <span className="metric-icon-badge">
            <Icon size={16} strokeWidth={2} />
          </span>
        )}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </RCard>
  );
}

function PageTitle({ eyebrow, title, count }: { eyebrow: string; title: string; count?: string }) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {count && (
        <RBadge variant="soft" color="gray" size="2">
          {count}
        </RBadge>
      )}
    </div>
  );
}

function CourseCard({
  course,
  index,
  onOpen,
}: {
  course: S.Course;
  index: number;
  onOpen: () => void;
}) {
  return (
    <button className={`course-card color-${index % 4}`} onClick={onOpen}>
      <div className="course-card-top">
        <span className="course-icon-badge">
          <BookOpen size={19} strokeWidth={1.75} />
        </span>
        <ArrowUpRight size={17} className="course-card-arrow" />
      </div>
      <h3>{course.name}</h3>
      <div className="course-card-meta">
        <RBadge variant="soft" color="gray" size="1">
          {course.course_code}
        </RBadge>
      </div>
      <div className="course-card-foot">
        <span>{course.teachers.map((t) => t.display_name).join('、') || '课程资料与课堂'}</span>
        <ChevronRight size={14} />
      </div>
    </button>
  );
}

function Due({ value }: { value: string | null }) {
  if (!value)
    return (
      <RBadge variant="soft" color="gray" size="1">
        未设截止
      </RBadge>
    );
  const time = Date.parse(value),
    past = Number.isFinite(time) && time < Date.now(),
    diffHours = Number.isFinite(time) ? (time - Date.now()) / (1000 * 3600) : 999;
  const isUrgent = !past && diffHours > 0 && diffHours <= 48;
  const color = past ? 'ruby' : isUrgent ? 'amber' : 'gray';

  return (
    <RBadge variant="soft" color={color} size="1" className="due-badge">
      <time dateTime={value}>
        {Number.isFinite(time)
          ? `${past ? '已逾期 · ' : isUrgent ? '即将截止 · ' : ''}${new Date(value).toLocaleString(
              'zh-CN',
              { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
            )}`
          : '截止时间待核对'}
      </time>
    </RBadge>
  );
}

function FileLibrary({
  course,
  query,
  selected,
  onSelect,
  onAsk,
  notice,
}: {
  course: S.Course;
  query: string;
  selected: S.CourseFile | null;
  onSelect: (f: S.CourseFile | null) => void;
  onAsk: (ctx: S.ChatContext) => void;
  notice: (s: string) => void;
}) {
  const files = useResource(`files:${course.id}`, () =>
      S.api<S.CourseFile[]>('files', { courseId: course.id })
    ),
    [saving, setSaving] = useState(0);
  const preview = useResource(
    `preview:${selected?.id}`,
    () => S.api<{ url: string }>('filePreview', { file: { id: selected!.id } }),
    !!selected
  );
  const filtered = files.data?.filter((f) => S.matches(f.display_name, query)) || [];

  return (
    <>
      {files.error && <ErrorNotice message={files.error} onRetry={files.reload} />}
      <div className={`file-workspace ${selected ? 'has-preview' : ''}`}>
        <div className="file-list">
          <div className="list-caption">
            <span>{files.busy ? '正在读取资料…' : `${filtered.length} 份资料`}</span>
            <RIconButton
              size="1"
              variant="ghost"
              color="gray"
              title="刷新资料"
              aria-label="刷新资料"
              onClick={files.reload}
            >
              <RefreshCw size={13} />
            </RIconButton>
          </div>
          {filtered.map((file) => (
            <button
              key={file.id}
              className={selected?.id === file.id ? 'file-row selected' : 'file-row'}
              onClick={() => onSelect(file)}
            >
              <span className="file-type">
                {file.display_name.split('.').at(-1)?.slice(0, 4).toUpperCase()}
              </span>
              <div>
                <strong>{file.display_name}</strong>
                <small>
                  {S.fileSize(file.size)}
                  {file.locked ? ' · 已锁定' : ''}
                </small>
              </div>
              <ChevronRight size={15} />
            </button>
          ))}
          {files.busy && <Loading />}
          {!files.busy && !filtered.length && !files.error && (
            <Empty title={query ? '没有匹配资料' : '课程暂无可见资料'} />
          )}
        </div>

        {selected && (
          <section className="file-preview">
            <div className="preview-heading">
              <div>
                <small>Canvas 平台预览</small>
                <h3>{selected.display_name}</h3>
              </div>
              <RIconButton
                size="2"
                variant="ghost"
                color="gray"
                aria-label="关闭预览"
                onClick={() => onSelect(null)}
              >
                <X size={17} />
              </RIconButton>
            </div>
            <div className="preview-actions">
              <RButton
                variant="soft"
                color="indigo"
                size="2"
                onClick={() =>
                  onAsk({
                    title: selected.display_name,
                    file: { id: selected.id, name: selected.display_name },
                  })
                }
              >
                <Sparkles size={15} />
                <span>阅读与提问</span>
              </RButton>
              <RTooltip content="独立窗口阅读">
                <RIconButton
                  size="2"
                  variant="soft"
                  color="gray"
                  aria-label="独立窗口阅读"
                  onClick={() =>
                    void S.previewWindow(selected).catch((e) => notice(S.errorText(e)))
                  }
                >
                  <ArrowUpRight size={17} />
                </RIconButton>
              </RTooltip>
              <RTooltip content="下载文件">
                <RIconButton
                  size="2"
                  variant="soft"
                  color="gray"
                  disabled={!!saving}
                  aria-label="下载文件"
                  onClick={() => {
                    setSaving(selected.id);
                    void S.downloadFile(selected)
                      .then((saved) => {
                        if (saved) notice('文件已保存到所选位置');
                      })
                      .catch((e) => notice(S.errorText(e)))
                      .finally(() => setSaving(0));
                  }}
                >
                  {saving ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                </RIconButton>
              </RTooltip>
            </div>
            <div className="platform-frame">
              {preview.busy ? (
                <Loading label="正在连接平台预览…" />
              ) : preview.error ? (
                <Empty
                  title="平台暂未提供嵌入预览"
                  description="可以打开独立阅读窗口，或下载到本机阅读。"
                  action={
                    <RButton
                      variant="soft"
                      color="indigo"
                      size="2"
                      onClick={() =>
                        void S.previewWindow(selected).catch((e) => notice(S.errorText(e)))
                      }
                    >
                      <span>打开阅读窗口</span>
                      <ExternalLink size={14} />
                    </RButton>
                  }
                />
              ) : preview.data ? (
                <iframe
                  key={selected.id}
                  title={selected.display_name}
                  src={preview.data.url}
                  allow="fullscreen"
                  referrerPolicy="no-referrer"
                />
              ) : null}
            </div>
            <p className="preview-help">
              加载空白时可用右上角按钮打开独立窗口；排版由 Canvas 提供。
            </p>
          </section>
        )}
        {!selected && files.data?.length ? (
          <div className="file-preview waiting">
            <Empty title="选择一份资料" description="先在这里预览，需要时再扩大阅读。" />
          </div>
        ) : null}
      </div>
    </>
  );
}

function RecordingLibrary({
  course,
  query,
  onPlay,
  onNotice,
  onLogin,
}: {
  course: S.Course;
  query: string;
  onPlay: (r: S.Recording) => void;
  onNotice: (s: string) => void;
  onLogin: () => void;
}) {
  const result = useResource(`recordings:${course.id}`, () =>
    S.api<Omit<S.Recording, 'courseId' | 'courseName'>[]>('videos', { courseId: course.id })
  );
  const videos = (result.data || []).filter((r) => S.matches(r.videoName, query));

  return (
    <>
      {result.error && <ErrorNotice message={result.error} onRetry={result.reload} />}
      <div className="recording-intro">
        <Video size={24} />
        <div>
          <h3>回到课堂，也可以打开直播</h3>
          <p>
            第一次读取课堂时，在“设置与连接”中完成官方网页登录，再点击“同步登录”。
          </p>
        </div>
        <RButton variant="soft" color="indigo" size="2" onClick={onLogin}>
          连接课堂
        </RButton>
      </div>
      {result.busy ? (
        <Loading label="正在读取课堂列表…" />
      ) : (
        <div className="recording-list">
          {videos.map((r) => (
            <button
              key={`${r.source}:${r.videoId}`}
              disabled={!r.playable}
              onClick={() => onPlay({ ...r, courseId: course.id, courseName: course.name })}
            >
              <span className="recording-thumb">
                <Video size={22} />
              </span>
              <div>
                <strong>{r.videoName}</strong>
                <small>
                  {r.courseBeginTime || '平台课堂'} · {r.availabilityLabel || '查看课堂'}
                </small>
              </div>
              <RBadge
                variant="soft"
                color={r.playable ? 'indigo' : 'gray'}
                size="1"
                className="recording-status-badge"
              >
                {r.playable ? '观看' : r.availabilityLabel || '暂未开放'}
              </RBadge>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {!videos.length && !result.error && (
            <Empty
              title="没有可见的课堂"
              description="可能尚未生成录播，也可能需要在官方课堂中确认权限。"
              action={
                <RButton
                  variant="soft"
                  color="gray"
                  size="2"
                  onClick={() => void S.portal('live').catch((e) => onNotice(S.errorText(e)))}
                >
                  打开官方课堂
                </RButton>
              }
            />
          )}
        </div>
      )}
    </>
  );
}

function Assignments({
  items,
  courseName,
  selected,
  onSelect,
  onAsk,
  notice,
  onSubmitted,
}: {
  items: S.Assignment[];
  courseName: (id: number) => string;
  selected: S.Assignment | null;
  onSelect: (a: S.Assignment | null) => void;
  onAsk: (ctx: S.ChatContext) => void;
  notice: (s: string) => void;
  onSubmitted: () => void;
}) {
  const [filter, setFilter] = useState('todo'),
    [files, setFiles] = useState<{ name: string; path: string; size: number }[]>([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);

  useEffect(() => setFiles([]), [selected?.id, selected?.courseId]);

  const list = items
    .filter((a) => filter === 'all' || (filter === 'done' ? S.submitted(a) : !S.submitted(a)))
    .sort(
      (a, b) =>
        (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity)
    );

  const requirementFiles = useMemo(() => {
    if (!selected) return [];
    const doc = new DOMParser().parseFromString(selected.description || '', 'text/html');
    return Array.from(doc.querySelectorAll('a[href]')).flatMap((a) => {
      const href = a.getAttribute('href') || '',
        match = href.match(/\/(?:api\/v1\/)?files\/(\d+)/);
      return match
        ? [
            {
              id: Number(match[1]),
              display_name: a.textContent || '作业附件',
              filename: '',
              size: 0,
              locked: false,
            },
          ]
        : [];
    });
  }, [selected]);

  if (selected)
    return (
      <section className="assignment-detail">
        <Back label="作业列表" onClick={() => onSelect(null)} />
        <div className="assignment-detail-title">
          <p className="eyebrow">{courseName(selected.courseId)}</p>
          <h2>{selected.name}</h2>
          <div className="assignment-meta">
            <Due value={selected.due_at} />
            <RBadge
              variant="soft"
              color={S.submitted(selected) ? 'green' : 'amber'}
              size="2"
            >
              {S.submitted(selected) ? '已提交' : '待提交'}
            </RBadge>
          </div>
        </div>
        <Markdown
          text={S.plain(selected.description) || '老师未填写文字要求，请在官方页面核对。'}
        />
        <div className="attachment-list">
          {requirementFiles.map((f) => (
            <div key={f.id} className="attachment-row">
              <FileText size={16} />
              <strong>{f.display_name}</strong>
              <RButton
                variant="soft"
                color="gray"
                size="1"
                onClick={() => void S.previewWindow(f).catch((e) => notice(S.errorText(e)))}
              >
                预览
              </RButton>
              <RIconButton
                size="1"
                variant="ghost"
                color="gray"
                title="下载要求附件"
                aria-label="下载要求附件"
                onClick={() => void S.downloadFile(f).catch((e) => notice(S.errorText(e)))}
              >
                <Download size={14} />
              </RIconButton>
            </div>
          ))}
        </div>
        {selected.submission?.attachments?.length && (
          <div className="attachment-list">
            <h3>已提交附件</h3>
            {selected.submission.attachments.map((f) => (
              <div key={f.id} className="attachment-row">
                <FileText size={16} />
                <strong>{f.display_name || f.filename}</strong>
                <RButton
                  variant="soft"
                  color="gray"
                  size="1"
                  onClick={() =>
                    void S.previewWindow({
                      ...f,
                      display_name: f.display_name || f.filename,
                      size: 0,
                      locked: false,
                    }).catch((e) => notice(S.errorText(e)))
                  }
                >
                  预览
                </RButton>
              </div>
            ))}
          </div>
        )}
        <div className="assignment-actions">
          <RButton
            variant="soft"
            color="indigo"
            size="2"
            onClick={() =>
              onAsk({
                title: selected.name,
                text: `课程：${courseName(selected.courseId)}\n作业要求：\n${S.plain(
                  selected.description
                )}`,
              })
            }
          >
            <Sparkles size={15} />
            <span>讨论作业</span>
          </RButton>
          <RButton
            variant="soft"
            color="gray"
            size="2"
            onClick={() =>
              void S.portal('assignment', selected.courseId, selected.id).catch((e) =>
                notice(S.errorText(e))
              )
            }
          >
            <ExternalLink size={15} />
            <span>官方作业页面</span>
          </RButton>
        </div>
        {selected.submission_types?.includes('online_upload') && !selected.locked_for_user && (
          <div className="submission-box">
            <h3>{S.submitted(selected) ? '重新提交附件' : '提交作业'}</h3>
            <p>提交前请核对附件；成功状态以平台返回的新记录为准。</p>
            {selected.allowed_extensions?.length && (
              <p>允许格式：{selected.allowed_extensions.join('、')}</p>
            )}
            <div className="attachment-list">
              {files.map((f) => (
                <div key={f.path} className="attachment-row">
                  <FileText size={16} />
                  <strong>{f.name}</strong>
                  <small>{S.fileSize(f.size)}</small>
                  <RIconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label={`移除 ${f.name}`}
                    disabled={busy}
                    onClick={() => setFiles((old) => old.filter((x) => x.path !== f.path))}
                  >
                    <X size={14} />
                  </RIconButton>
                </div>
              ))}
            </div>
            <div className="assignment-actions">
              <RButton
                variant="soft"
                color="gray"
                size="2"
                disabled={busy || uploading}
                onClick={() => {
                  setUploading(true);
                  void S.pickFiles(false)
                    .then((result) => setFiles((old) => [...old, ...result]))
                    .catch((e) => notice(S.errorText(e)))
                    .finally(() => setUploading(false));
                }}
              >
                <Plus size={15} />
                <span>{uploading ? '正在导入…' : '选择文件'}</span>
              </RButton>
              <RButton
                variant="solid"
                color="indigo"
                size="2"
                disabled={!files.length || busy || uploading}
                onClick={() => {
                  if (
                    selected.allowed_extensions?.length &&
                    files.some(
                      (f) =>
                        !selected.allowed_extensions!
                          .map((x) => x.toLowerCase())
                          .includes(f.name.split('.').at(-1)!.toLowerCase())
                    )
                  ) {
                    notice('附件格式不符合老师要求，请检查后重选');
                    return;
                  }
                  if (!confirm(`向「${selected.name}」提交这 ${files.length} 个文件？`)) return;
                  setBusy(true);
                  void S.call<{ status: string; message?: string }>('submit_work', {
                    courseId: selected.courseId,
                    assignmentId: selected.id,
                    paths: files.map((f) => f.path),
                  })
                    .then((receipt) => {
                      if (receipt.status === 'submitted') onSubmitted();
                      else
                        notice(
                          receipt.message ||
                            '尚未取得提交回执，请先到平台回查，避免重复提交。'
                        );
                    })
                    .catch((e) => notice(S.errorText(e)))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? (
                  <>
                    <Loader2 size={15} className="spin" />
                    <span>正在提交…</span>
                  </>
                ) : (
                  <>
                    <span>提交附件</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </RButton>
            </div>
          </div>
        )}
      </section>
    );

  return (
    <>
      <div className="assignment-filters-wrapper">
        <RSegmentedControl.Root
          value={filter}
          onValueChange={setFilter}
          size="2"
          className="assignment-filters"
        >
          <RSegmentedControl.Item value="todo">待完成</RSegmentedControl.Item>
          <RSegmentedControl.Item value="done">已提交</RSegmentedControl.Item>
          <RSegmentedControl.Item value="all">全部</RSegmentedControl.Item>
        </RSegmentedControl.Root>
      </div>

      <div className="assignment-list">
        {list.map((a) => (
          <button
            className="assignment-item"
            key={`${a.courseId}:${a.id}`}
            onClick={() => onSelect(a)}
          >
            <span className={S.submitted(a) ? 'assignment-check done' : 'assignment-check'}>
              {S.submitted(a) ? <Check size={18} /> : <FileText size={18} />}
            </span>
            <div>
              <strong>{a.name}</strong>
              <small>{courseName(a.courseId)}</small>
            </div>
            <Due value={a.due_at} />
            <ChevronRight size={16} />
          </button>
        ))}
        {!list.length && (
          <Empty title={filter === 'done' ? '这里还没有已提交作业' : '当前列表没有作业'} />
        )}
      </div>
    </>
  );
}

function Notes({
  accountId,
  version,
  query,
  onAsk,
  notice,
}: {
  accountId: string;
  version: number;
  query: string;
  onAsk: (ctx: S.ChatContext) => void;
  notice: (s: string) => void;
}) {
  const [notes, setNotes] = useState<S.Note[]>([]),
    [current, setCurrent] = useState<S.Note | null>(null),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false);
  const pending = useRef({ current, dirty });
  pending.current = { current, dirty };

  useEffect(
    () => () => {
      if (pending.current.dirty && pending.current.current)
        void S.putSaved('notes', { ...pending.current.current, updated: Date.now() }).catch((e) =>
          notice(S.errorText(e))
        );
    },
    []
  );

  useEffect(() => {
    let alive = true;
    void S.listSaved<S.Note>('notes', accountId)
      .then((list) => {
        if (alive) setNotes(list.sort((a, b) => b.updated - a.updated));
      })
      .catch((e) => setError(S.errorText(e)));
    return () => {
      alive = false;
    };
  }, [accountId, version]);

  const save = async () => {
    if (!current) return;
    const note = { ...current, updated: Date.now() };
    try {
      await S.putSaved('notes', note);
      setNotes((old) => [note, ...old.filter((n) => n.id !== note.id)]);
      setDirty(false);
      notice('笔记已保存');
    } catch (e) {
      notice(S.errorText(e));
    }
  };

  return (
    <div className="desktop-content">
      <PageTitle title="我的笔记" eyebrow="留下真正理解的内容" />
      <div className="notes-layout">
        <div className="notes-list">
          <RButton
            variant="soft"
            color="indigo"
            size="2"
            className="new-note-button"
            onClick={() => {
              if (dirty && !confirm('未保存的修改会丢失，继续新建？')) return;
              setCurrent({
                id: crypto.randomUUID(),
                account: accountId,
                title: '新笔记',
                body: '',
                updated: Date.now(),
              });
              setDirty(true);
            }}
          >
            <Plus size={16} />
            <span>新建笔记</span>
          </RButton>
          {notes
            .filter((n) => S.matches(`${n.title} ${n.body}`, query))
            .map((n) => (
              <button
                className={current?.id === n.id ? 'note-list-item selected' : 'note-list-item'}
                key={n.id}
                onClick={() => {
                  if (dirty && !confirm('放弃未保存的修改？')) return;
                  setCurrent(n);
                  setDirty(false);
                }}
              >
                <strong>{n.title}</strong>
                <small>{new Date(n.updated).toLocaleDateString('zh-CN')}</small>
                <p>{n.body.replace(/[#*$]/g, '').slice(0, 70)}</p>
              </button>
            ))}
        </div>
        <div className="note-editor">
          {error && <ErrorNotice message={error} />}
          {current ? (
            <>
              <div className="note-toolbar">
                <input
                  value={current.title}
                  aria-label="笔记标题"
                  onChange={(e) => {
                    setCurrent({ ...current, title: e.target.value });
                    setDirty(true);
                  }}
                />
                <RButton
                  variant="solid"
                  color="indigo"
                  size="2"
                  disabled={!dirty}
                  onClick={() => void save()}
                >
                  保存
                </RButton>
                <RTooltip content="导出 Markdown">
                  <RIconButton
                    size="2"
                    variant="soft"
                    color="gray"
                    aria-label="导出笔记"
                    onClick={() => {
                      void S.exportNote(current).catch((e) => notice(S.errorText(e)));
                    }}
                  >
                    <Download size={16} />
                  </RIconButton>
                </RTooltip>
                <RTooltip content="删除笔记">
                  <RIconButton
                    size="2"
                    variant="soft"
                    color="ruby"
                    aria-label="删除笔记"
                    onClick={() => {
                      if (!confirm('删除这篇笔记？')) return;
                      void S.deleteSaved('notes', current.id)
                        .then(() => {
                          setNotes((old) => old.filter((n) => n.id !== current.id));
                          setCurrent(null);
                          setDirty(false);
                        })
                        .catch((e) => notice(S.errorText(e)));
                    }}
                  >
                    <Trash2 size={16} />
                  </RIconButton>
                </RTooltip>
              </div>
              <div className="note-edit-split">
                <textarea
                  aria-label="笔记正文"
                  value={current.body}
                  onChange={(e) => {
                    setCurrent({ ...current, body: e.target.value });
                    setDirty(true);
                  }}
                  placeholder="支持 Markdown 与 LaTeX 公式…"
                />
                <div className="note-preview">
                  <Markdown text={current.body || '预览会显示在这里。'} />
                </div>
              </div>
              <div className="note-bottom">
                <span>
                  {dirty ? '尚未保存' : '已保存到本机'}
                  {current.source ? ` · ${current.source}` : ''}
                </span>
                <RButton
                  variant="soft"
                  color="indigo"
                  size="1"
                  onClick={() => onAsk({ title: current.title, text: current.body })}
                >
                  <MessageCircle size={14} />
                  <span>问这篇笔记</span>
                </RButton>
              </div>
            </>
          ) : (
            <Empty
              title="笔记与理解，随时回看"
              description="可以新建笔记，也可以让 AI 将对话提炼后存到这里。"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Downloads({ query, notice }: { query: string; notice: (s: string) => void }) {
  type Item = {
    id: string;
    fileId: number;
    name: string;
    path: string;
    size: number;
    exists: boolean;
    savedAt: string;
  };
  const result = useResource('downloads', () => S.call<Item[]>('desktop_downloads')),
    [busy, setBusy] = useState('');
  const items = (result.data || []).filter((item) => S.matches(item.name, query));

  function action(item: Item, kind: string) {
    setBusy(item.id);
    void S.call('desktop_download_action', { id: item.id, action: kind })
      .then(() => {
        if (kind === 'delete') {
          result.reload();
          notice('已删除下载文件');
        }
      })
      .catch((e) => notice(S.errorText(e)))
      .finally(() => setBusy(''));
  }

  return (
    <div className="desktop-content">
      <PageTitle
        title="下载"
        eyebrow="文件留在你选择的位置"
        count={`${items.length} 个文件`}
      />
      {result.error && <ErrorNotice message={result.error} onRetry={result.reload} />}
      <div className="downloads-list">
        {items.map((item) => (
          <div className="download-item" key={item.id}>
            <span className="file-type">
              {item.name.split('.').at(-1)?.slice(0, 4).toUpperCase()}
            </span>
            <div>
              <strong>{item.name}</strong>
              <small>
                {S.fileSize(item.size)} ·{' '}
                {new Date(item.savedAt).toLocaleDateString('zh-CN')}
                {!item.exists ? ' · 本机文件已移走' : ''}
              </small>
              <p title={item.path}>{item.path}</p>
            </div>
            <RButton
              variant="soft"
              color="gray"
              size="2"
              disabled={!!busy}
              onClick={() => {
                setBusy(item.id);
                void S.previewWindow({
                  id: item.fileId,
                  display_name: item.name,
                  filename: item.name,
                  size: item.size,
                  locked: false,
                })
                  .catch(() => {
                    action(item, 'open');
                    notice('平台未提供预览，改用本机阅读器');
                  })
                  .finally(() => setBusy(''));
              }}
            >
              平台预览
            </RButton>
            <RTooltip content="本机打开">
              <RIconButton
                size="2"
                variant="soft"
                color="gray"
                aria-label={`打开 ${item.name}`}
                disabled={!!busy || !item.exists}
                onClick={() => action(item, 'open')}
              >
                <ExternalLink size={16} />
              </RIconButton>
            </RTooltip>
            <RTooltip content="删除下载">
              <RIconButton
                size="2"
                variant="soft"
                color="ruby"
                aria-label={`删除 ${item.name}`}
                disabled={!!busy}
                onClick={() => {
                  if (confirm(`删除下载文件「${item.name}」？平台原文件不会被删除。`))
                    action(item, 'delete');
                }}
              >
                <Trash2 size={16} />
              </RIconButton>
            </RTooltip>
          </div>
        ))}
        {result.busy && <Loading />}
        {!result.busy && !items.length && !result.error && (
          <Empty
            title="还没有下载文件"
            description="在资料预览中点击下载，文件与保存位置会显示在这里。"
          />
        )}
      </div>
    </div>
  );
}

function LiveWorkspace({
  onNotice,
  onAsk,
}: {
  onNotice: (s: string) => void;
  onAsk: (ctx: S.ChatContext) => void;
}) {
  const [platform, setPlatform] = useState('https://v.sjtu.edu.cn/');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [full, setFull] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setFull(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  return (
    <div className="desktop-content live-workspace-content">
      <div className="live-workspace-header">
        <PageTitle
          eyebrow="官方直播与课堂转播"
          title="课堂直播"
          count={platform === 'https://v.sjtu.edu.cn/' ? '课堂教学' : '交大主站'}
        />
        <div className="live-toolbar-actions">
          <RSegmentedControl.Root
            size="2"
            value={platform}
            onValueChange={(val) => {
              setPlatform(val);
              setLoading(true);
              setReloadKey((k) => k + 1);
            }}
          >
            <RSegmentedControl.Item value="https://v.sjtu.edu.cn/">
              课堂教学平台
            </RSegmentedControl.Item>
            <RSegmentedControl.Item value="https://live.sjtu.edu.cn/">
              交大直播主站
            </RSegmentedControl.Item>
          </RSegmentedControl.Root>

          <RTooltip content="刷新直播页面">
            <RIconButton
              size="2"
              variant="soft"
              color="gray"
              aria-label="刷新直播页面"
              onClick={() => {
                setLoading(true);
                setReloadKey((k) => k + 1);
              }}
            >
              <RefreshCw size={15} />
            </RIconButton>
          </RTooltip>

          <RTooltip content={full ? '退出全屏' : '全屏观看'}>
            <RIconButton
              size="2"
              variant="soft"
              color="gray"
              aria-label="全屏观看"
              onClick={() => {
                if (full) void document.exitFullscreen().catch(() => {});
                else void containerRef.current?.requestFullscreen().catch(() => onNotice('全屏暂不可用'));
              }}
            >
              {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </RIconButton>
          </RTooltip>

          <RButton
            variant="soft"
            color="indigo"
            size="2"
            onClick={() =>
              onAsk({
                title: platform === 'https://v.sjtu.edu.cn/' ? '官方课堂教学直播' : '交大直播主站',
                text: `正在观看交大直播（${platform}）。请向我提供随堂提问、概念理解与重点笔记记录。`,
              })
            }
          >
            <Sparkles size={15} />
            <span>问这堂直播</span>
          </RButton>

          <RButton
            variant="soft"
            color="gray"
            size="2"
            onClick={() => void S.portal('live').catch((e) => onNotice(S.errorText(e)))}
          >
            <ExternalLink size={15} />
            <span>独立窗口打开</span>
          </RButton>
        </div>
      </div>

      <div className={`embedded-live-frame ${full ? 'fullscreen' : ''}`} ref={containerRef}>
        {loading && (
          <div className="live-loading-overlay">
            <Loading label="正在连接官方直播平台，请稍候…" />
          </div>
        )}
        <iframe
          key={`${platform}:${reloadKey}`}
          title="Canvas 官方直播与课堂转播"
          src={platform}
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
        />
      </div>

      <div className="live-footer-tip">
        <Sparkles size={14} className="tip-icon" />
        <span>
          支持直接在学习工作区内观看交大官方课堂与活动直播；如需校内身份验证，已保存的 jAccount 会话会自动共享，也可点击右上角『独立窗口打开』进行交互。
        </span>
      </div>
    </div>
  );
}

function SettingsDialog({
  account,
  saved,
  onClose,
  onSave,
  notice,
}: {
  account: S.Account | null;
  saved: S.Settings;
  onClose: () => void;
  onSave: (c: S.Account, validate: boolean) => Promise<void>;
  notice: (s: string) => void;
}) {
  const [draft, setDraft] = useState<S.Account>(
      account || saved.accounts.find((a) => a.accountId === saved.currentId) || S.blankAccount()
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [tab, setTab] = useState('account');
  const fallbackLoggedIn = Boolean(
    account?.cookie || Object.values(account?.webCookies || {}).some(Boolean)
  );
  const [loginStatus, setLoginStatus] = useState<S.WebLoginStatus | null>(
    fallbackLoggedIn
      ? {
          loggedIn: true,
          sources: Object.keys(account?.webCookies || {}),
          hasCanvasToken: Boolean(account?.token),
        }
      : null
  );

  useEffect(() => {
    let alive = true;
    if (!account) {
      setLoginStatus(null);
      return;
    }
    void S.webLoginStatus()
      .then((value) => {
        if (alive) setLoginStatus(value);
      })
      .catch(() => {
        if (alive)
          setLoginStatus({
            loggedIn: fallbackLoggedIn,
            sources: Object.keys(account.webCookies || {}),
            hasCanvasToken: Boolean(account.token),
          });
      });
    return () => {
      alive = false;
    };
  }, [account, fallbackLoggedIn]);

  const set = (field: keyof S.Account, value: string) =>
    setDraft((old) => ({ ...old, [field]: value }));

  async function submit(validate: boolean) {
    setBusy(true);
    setError('');
    try {
      await onSave(
        { ...draft, accountId: draft.accountId.trim(), token: draft.token.trim() },
        validate
      );
      onClose();
    } catch (e) {
      setError(S.errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header>
          <div>
            <p className="eyebrow">偏好与连接</p>
            <h2 id="settings-title">设置你的学习空间</h2>
          </div>
          <RIconButton
            variant="soft"
            color="gray"
            size="2"
            aria-label="关闭设置"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </RIconButton>
        </header>

        <RTabs.Root value={tab} onValueChange={setTab}>
          <RTabs.List className="settings-tabs">
            <RTabs.Trigger value="account">Canvas 连接</RTabs.Trigger>
            <RTabs.Trigger value="model">AI 模型服务</RTabs.Trigger>
          </RTabs.List>
        </RTabs.Root>

        <div className="settings-body">
          {error && <ErrorNotice message={error} />}
          {tab === 'account' ? (
            <>
              <p className="settings-description">
                课程与作业使用 Canvas Token。课堂录播再通过官方网页登录，账号配置使用 Windows
                本机保护保存。
              </p>
              <label className="field">
                账号名称
                <input
                  autoComplete="off"
                  value={draft.accountId}
                  onChange={(e) => set('accountId', e.target.value)}
                  placeholder="例如：主账号"
                />
              </label>
              <label className="field">
                Canvas Token
                <input
                  autoComplete="off"
                  type="password"
                  value={draft.token}
                  onChange={(e) => set('token', e.target.value)}
                  placeholder="粘贴本部 Canvas 访问令牌"
                />
              </label>
              <button
                className="text-button"
                onClick={() => void S.portal('token').catch((e) => setError(S.errorText(e)))}
              >
                <span>打开 Canvas 个人设置获取令牌</span>
                <ArrowUpRight size={13} />
              </button>

              <div className="setting-section">
                <div className="setting-heading">
                  <div>
                    <h3>课堂网页登录</h3>
                    <p>
                      登录一次即可保存会话。重新打开窗口时会自动复用，只有会话失效才需要重新验证。
                    </p>
                  </div>
                  <RBadge color={loginStatus?.loggedIn ? 'green' : 'gray'} variant="soft" size="2">
                    {loginStatus?.loggedIn ? '已登录' : '待同步'}
                  </RBadge>
                </div>
                <div className="assignment-actions">
                  <RButton
                    variant="outline"
                    color="gray"
                    size="2"
                    disabled={busy}
                    onClick={() => void S.portal('login').catch((e) => setError(S.errorText(e)))}
                  >
                    <ExternalLink size={15} />
                    <span>打开官方登录</span>
                  </RButton>
                  <RButton
                    variant={loginStatus?.loggedIn ? 'soft' : 'solid'}
                    color="indigo"
                    size="2"
                    disabled={busy || !account}
                    onClick={() => {
                      setBusy(true);
                      setError('');
                      void S.call<{ cookie: string; webCookies: Record<string, string> }>(
                        'desktop_sync_login'
                      )
                        .then(async (result) => {
                          const next = {
                            ...draft,
                            cookie: result.cookie,
                            webCookies: result.webCookies,
                          };
                          await onSave(next, false);
                          setDraft(next);
                          setLoginStatus({
                            loggedIn: true,
                            sources: Object.keys(result.webCookies),
                            hasCanvasToken: Boolean(next.token),
                          });
                          notice('网页登录已同步，可以打开课堂');
                        })
                        .catch((e) => setError(S.errorText(e)))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <RefreshCw size={14} />
                    <span>{loginStatus?.loggedIn ? '重新检查登录' : '同步登录'}</span>
                  </RButton>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="settings-description">
                支持兼容 OpenAI
                协议的模型服务。学习助手会保留历史、引用当前资料，并提供教学方式选项。
              </p>
              <label className="field">
                服务地址
                <input
                  type="url"
                  value={draft.modelUrl}
                  onChange={(e) => set('modelUrl', e.target.value)}
                  placeholder="https://…/v1"
                />
              </label>
              <label className="field">
                API Key
                <input
                  type="password"
                  autoComplete="off"
                  value={draft.modelKey}
                  onChange={(e) => set('modelKey', e.target.value)}
                />
              </label>
              <label className="field">
                模型名称
                <input
                  value={draft.modelName}
                  onChange={(e) => set('modelName', e.target.value)}
                  placeholder="模型的准确名称"
                />
              </label>
              <div className="settings-note">
                <Sparkles size={16} />
                <p>
                  模型返回的思考摘要默认折叠；不支持思考输出的模型会直接显示回答。资料、字幕和截图的读取范围会在当前对话中说明。
                </p>
              </div>
            </>
          )}
        </div>

        <footer>
          <span>Canvas 随行 · Windows 1.0.0</span>
          <RButton
            variant="solid"
            color="indigo"
            size="2"
            disabled={busy || !draft.accountId.trim() || !draft.token.trim()}
            onClick={() => void submit(!account || draft.token !== account.token)}
          >
            {busy ? (
              <>
                <Loader2 size={15} className="spin" />
                <span>正在保存…</span>
              </>
            ) : (
              <>
                <Check size={15} />
                <span>保存并连接</span>
              </>
            )}
          </RButton>
        </footer>
      </section>
    </div>
  );
}
