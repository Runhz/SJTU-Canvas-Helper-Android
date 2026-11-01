import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Badge as RBadge,
  Button as RButton,
  IconButton as RIconButton,
  Tabs as RTabs,
  Tooltip as RTooltip,
} from '@radix-ui/themes';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  FileText,
  Maximize2,
  MessageCircle,
  Minimize2,
  Move,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Subtitles,
  ZoomIn,
  ZoomOut,
  Sparkles,
} from 'lucide-react';
import * as S from './services';
import { Back, Empty, ErrorNotice, Loading } from './ui';
import { playbackUrl } from './domain';

export function Player({
  recording,
  accountId,
  visible,
  onBack,
  onAsk,
  onNotice,
  seekRequest,
}: {
  recording: S.Recording;
  accountId: string;
  visible: boolean;
  onBack: () => void;
  onAsk: (ctx: S.ChatContext) => void;
  onNotice: (s: string) => void;
  seekRequest?: { seconds: number; nonce: number };
}) {
  const video = useRef<HTMLVideoElement>(null),
    frame = useRef<HTMLDivElement>(null),
    slideStage = useRef<HTMLDivElement>(null),
    saveAt = useRef(0),
    lastTime = useRef(0),
    loaded = useRef(false);
  const [tracks, setTracks] = useState<string[]>([]),
    [track, setTrack] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [lines, setLines] = useState<S.Subtitle[]>([]),
    [slides, setSlides] = useState<S.Slide[]>([]),
    [materialError, setMaterialError] = useState(''),
    [position, setPosition] = useState(0),
    [rate, setRate] = useState(1),
    [subtitle, setSubtitle] = useState(true);
  const [tab, setTab] = useState<'subtitles' | 'slides' | 'notes'>('subtitles'),
    [slideIndex, setSlideIndex] = useState(0),
    [follow, setFollow] = useState(true),
    [selected, setSelected] = useState<number[]>([]),
    [showSlide, setShowSlide] = useState(true),
    [floating, setFloating] = useState(false),
    [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [floatPos, setFloatPos] = useState({ x: 16, y: 16 }),
    [floatWidth, setFloatWidth] = useState(340),
    [note, setNote] = useState('');
  const gesture = useRef<{
      kind: 'pan' | 'move' | 'resize';
      x: number;
      y: number;
      originX: number;
      originY: number;
      width: number;
    }>(),
    hold = useRef<ReturnType<typeof setTimeout>>(),
    beforeHold = useRef(0),
    latestRate = useRef(rate);
  latestRate.current = rate;
  const latestSeek = useRef(seekRequest);
  latestSeek.current = seekRequest;
  const key = `${accountId}:video:${recording.source}:${recording.videoId}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setMaterialError('');
    setTracks([]);
    setLines([]);
    setSlides([]);
    setSelected([]);
    setTrack(0);
    setPosition(0);
    setSlideIndex(0);
    lastTime.current = 0;
    loaded.current = false;
    void (async () => {
      try {
        const saved = await S.stateGet<{ seconds: number; rate: number }>(key).catch(
          () => undefined
        );
        if (cancelled) return;
        lastTime.current = latestSeek.current?.seconds ?? saved?.seconds ?? 0;
        setRate(saved?.rate || 1);
        // Launch this course before resolving URLs: the platform's playback token is course-scoped.
        await S.api('videos', { courseId: recording.courseId });
        const info = await S.api<{ videoPlayResponseVoList: { rtmpUrlHdv: string }[]; courId: number }>(
          'videoInfo',
          { videoId: recording.videoId, source: recording.source }
        );
        const port = await S.call<number>('desktop_prepare_player');
        const urls = (info.videoPlayResponseVoList || []).map((t) =>
          playbackUrl(t.rtmpUrlHdv, port, recording.source)
        );
        if (!urls.length) throw new Error('平台尚未提供可播放的机位');
        if (cancelled) return;
        setTracks(urls);
        setLoading(false);
        if (info.courId) {
          const results = await Promise.allSettled([
            S.api<{ beforeAssemblyList: S.Subtitle[]; afterAssemblyList: S.Subtitle[] }>('subtitles', {
              courseId: info.courId,
            }),
            S.api<S.Slide[]>('slides', { courseId: info.courId }),
          ]);
          if (cancelled) return;
          if (results[0].status === 'fulfilled') {
            const raw = results[0].value;
            setLines(
              (raw.beforeAssemblyList?.length ? raw.beforeAssemblyList : raw.afterAssemblyList) || []
            );
          }
          if (results[1].status === 'fulfilled')
            setSlides(
              results[1].value
                .filter((s) => s.pptImgUrl)
                .sort((a, b) => Number(a.createSec) - Number(b.createSec))
            );
          if (results.some((r) => r.status === 'rejected'))
            setMaterialError('部分字幕或切片暂不可用，可重新加载或打开官方课堂。');
        }
      } catch (e) {
        if (!cancelled) {
          setLoading(false);
          setError(S.errorText(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      void S.statePut(key, { seconds: lastTime.current, rate: latestRate.current }).catch(() => {});
    };
  }, [key, retry]);

  useEffect(() => {
    const element = video.current,
      url = tracks[track];
    if (!element || !url) return;
    let hls: Hls | undefined;
    if (/\.m3u8(?:\?|$)/i.test(url) && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 45, backBufferLength: 20 });
      hls.loadSource(url);
      hls.attachMedia(element);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setError('视频连接中断，请重试；已保留观看位置。');
      });
    } else element.src = url;
    return () => {
      lastTime.current = element.currentTime || lastTime.current;
      element.pause();
      hls?.destroy();
      element.removeAttribute('src');
      element.load();
    };
  }, [tracks, track]);

  useEffect(() => {
    if (!visible) video.current?.pause();
  }, [visible]);

  useEffect(() => {
    if (!seekRequest) return;
    lastTime.current = seekRequest.seconds;
    if (video.current && loaded.current) video.current.currentTime = seekRequest.seconds;
  }, [seekRequest]);

  useEffect(() => {
    const update = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    if (!follow || !slides.length) return;
    let index = 0;
    for (let i = 0; i < slides.length; i++)
      if (Number(slides[i].createSec) <= position) index = i;
    setSlideIndex(index);
  }, [position, slides, follow]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [slideIndex]);

  const activeLine = lines.find((s) => s.bg <= position * 1000 && s.ed >= position * 1000);
  const context = (image?: string): S.ChatContext => ({
    title: recording.videoName,
    courseId: recording.courseId,
    resourceId: `${recording.source}:${recording.videoId}`,
    positionLabel: S.formatTime(position),
    positionSeconds: position,
    text: lines
      .filter((s) =>
        selected.length
          ? selected.includes(s.bg)
          : s.ed >= Math.max(0, position - 90) * 1000 && s.bg <= (position + 15) * 1000
      )
      .map((s) => `[${S.formatTime(s.bg / 1000)}] ${s.res}`)
      .join('\n'),
    lectureBackground: { resourceId: `${recording.source}:${recording.videoId}`, lines },
    ...(image ? { screenshot: image } : {}),
  });

  const openAsk = (ctx: S.ChatContext) => {
    video.current?.pause();
    if (document.fullscreenElement === frame.current)
      void document
        .exitFullscreen()
        .then(() => onAsk(ctx))
        .catch(() => onAsk(ctx));
    else onAsk(ctx);
  };
  const seek = (seconds: number) => {
    if (video.current) {
      video.current.currentTime = seconds;
      setPosition(seconds);
    }
  };

  async function screenshot() {
    try {
      const source = video.current;
      if (!source?.videoWidth) throw new Error('请等待视频画面加载');
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1440 / source.videoWidth);
      canvas.width = source.videoWidth * scale;
      canvas.height = source.videoHeight * scale;
      canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
      openAsk(context(canvas.toDataURL('image/jpeg', 0.84)));
      source.pause();
    } catch {
      onNotice('此视频源限制画面读取，可选择字幕提问或用系统截图粘贴。');
    }
  }

  async function screenshotSlide() {
    const url = slides[slideIndex]?.pptImgUrl;
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw Error();
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement('canvas'),
        scale = Math.min(1, 1440 / bitmap.width);
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      openAsk(context(canvas.toDataURL('image/jpeg', 0.84)));
    } catch {
      onNotice('平台限制了切片画面读取，请使用系统截图；字幕上下文仍可提问。');
      openAsk(context());
    }
  }

  const finishHold = () => {
    clearTimeout(hold.current);
    if (video.current && beforeHold.current > 0) {
      video.current.playbackRate = beforeHold.current;
      beforeHold.current = 0;
    }
  };
  useEffect(() => () => clearTimeout(hold.current), []);

  function begin(e: React.PointerEvent, kind: 'pan' | 'move' | 'resize') {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      kind,
      x: e.clientX,
      y: e.clientY,
      originX: kind === 'pan' ? pan.x : floatPos.x,
      originY: kind === 'pan' ? pan.y : floatPos.y,
      width: floatWidth,
    };
  }

  function move(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (g.kind === 'pan') {
      const b = slideStage.current?.getBoundingClientRect();
      setPan({
        x: Math.max(-(b?.width || 500), Math.min(b?.width || 500, g.originX + dx)),
        y: Math.max(-(b?.height || 300), Math.min(b?.height || 300, g.originY + dy)),
      });
    } else if (g.kind === 'resize')
      setFloatWidth(Math.max(220, Math.min((frame.current?.clientWidth || 900) * 0.7, g.width + dx)));
    else
      setFloatPos({
        x: Math.max(0, Math.min((frame.current?.clientWidth || 900) - floatWidth, g.originX + dx)),
        y: Math.max(0, Math.min((frame.current?.clientHeight || 600) - 120, g.originY + dy)),
      });
  }

  const slidePanel = (
    <section
      className={`slide-panel ${floating ? 'floating' : ''}`}
      style={floating ? { left: floatPos.x, top: floatPos.y, width: floatWidth } : undefined}
      onPointerMove={move}
      onPointerUp={() => {
        gesture.current = undefined;
      }}
      onPointerCancel={() => {
        gesture.current = undefined;
      }}
    >
      <div className="slide-toolbar">
        <div className="icon-group">
          <RIconButton
            size="1"
            variant="ghost"
            color="gray"
            title="上一页"
            aria-label="上一页课件"
            disabled={slideIndex === 0}
            onClick={() => {
              setFollow(false);
              setSlideIndex((i) => i - 1);
            }}
          >
            <ArrowLeft size={13} />
          </RIconButton>
          <span className="slide-counter">
            {slides.length ? slideIndex + 1 : 0} / {slides.length}
          </span>
          <RIconButton
            size="1"
            variant="ghost"
            color="gray"
            title="下一页"
            aria-label="下一页课件"
            disabled={slideIndex >= slides.length - 1}
            onClick={() => {
              setFollow(false);
              setSlideIndex((i) => i + 1);
            }}
          >
            <ArrowRight size={13} />
          </RIconButton>
        </div>

        <div className="icon-group">
          <RIconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label="缩小课件"
            onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
          >
            <ZoomOut size={13} />
          </RIconButton>
          <RIconButton
            size="1"
            variant="ghost"
            color="gray"
            title="适应窗口"
            aria-label="重置课件缩放"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <RotateCcw size={12} />
          </RIconButton>
          <RIconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label="放大课件"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          >
            <ZoomIn size={13} />
          </RIconButton>
          {floating && (
            <RIconButton
              size="1"
              variant="ghost"
              color="gray"
              title="移动小窗"
              aria-label="移动课件小窗"
              onPointerDown={(e) => begin(e, 'move')}
            >
              <Move size={13} />
            </RIconButton>
          )}
          <RIconButton
            size="1"
            variant="ghost"
            color="indigo"
            title="课件截图提问"
            aria-label="课件截图提问"
            onClick={() => void screenshotSlide()}
          >
            <Sparkles size={13} />
          </RIconButton>
        </div>
      </div>

      <div
        ref={slideStage}
        className="slide-stage"
        onPointerDown={(e) => begin(e, 'pan')}
        onWheel={(e) => {
          setZoom((z) => Math.min(4, Math.max(0.25, z + (e.deltaY > 0 ? -0.1 : 0.1))));
        }}
      >
        {slides[slideIndex]?.pptImgUrl ? (
          <img
            src={slides[slideIndex].pptImgUrl}
            alt={`课件第 ${slideIndex + 1} 页`}
            draggable={false}
            style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}
          />
        ) : (
          <Empty
            title="暂无课件切片"
            description={loading ? '正在读取课堂资料' : '平台未提供这一节的切片'}
          />
        )}
      </div>

      <div className="slide-footer">
        <button
          className={`text-button ${follow ? 'active' : ''}`}
          onClick={() => setFollow((v) => !v)}
        >
          {follow ? '跟随讲课位置' : '恢复跟随'}
        </button>
        <span className="slide-zoom-label">{Math.round(zoom * 100)}%</span>
        {floating && (
          <button
            className="resize-grip"
            title="调整小窗宽度"
            aria-label="调整课件宽度"
            onPointerDown={(e) => begin(e, 'resize')}
          >
            ◢
          </button>
        )}
      </div>
    </section>
  );

  return (
    <div className="recording-workspace">
      <div className="workspace-title">
        <Back onClick={onBack} label="录播列表" />
        <div>
          <small>{recording.courseName}</small>
          <h2>{recording.videoName}</h2>
        </div>
        <RButton
          variant="soft"
          color="indigo"
          size="2"
          onClick={() => openAsk(context())}
        >
          <Sparkles size={15} />
          <span>问这一段</span>
        </RButton>
      </div>

      {error && <ErrorNotice message={error} onRetry={() => setRetry((v) => v + 1)} />}

      <div
        className={`player-layout ${showSlide && !floating ? 'with-slides' : ''}`}
        ref={frame}
      >
        <div className="video-column">
          <div
            className="video-stage"
            onPointerDown={(e) => {
              if (e.target !== video.current) return;
              beforeHold.current = video.current.playbackRate;
              hold.current = setTimeout(() => {
                if (video.current) video.current.playbackRate = 3;
              }, 450);
            }}
            onPointerUp={finishHold}
            onPointerCancel={finishHold}
            onPointerLeave={finishHold}
          >
            {loading ? (
              <Loading label="正在连接课堂视频…" />
            ) : (
              <video
                ref={video}
                controls
                crossOrigin="anonymous"
                playsInline
                onLoadedMetadata={() => {
                  const node = video.current!;
                  if (Number.isFinite(node.duration) && lastTime.current > node.duration - 1)
                    lastTime.current = 0;
                  node.currentTime = lastTime.current;
                  node.playbackRate = rate;
                  loaded.current = true;
                }}
                onTimeUpdate={() => {
                  const node = video.current!;
                  lastTime.current = node.currentTime;
                  setPosition(node.currentTime);
                  if (Date.now() - saveAt.current > 4000 && loaded.current) {
                    saveAt.current = Date.now();
                    void S.statePut(key, {
                      seconds: node.currentTime,
                      rate: node.playbackRate,
                    }).catch((e) => onNotice(S.errorText(e)));
                  }
                }}
                onError={() => {
                  if (tracks.length)
                    setError('此视频无法播放，可重新连接或在官方课堂中打开。');
                }}
              />
            )}
            {subtitle && activeLine && <div className="video-subtitle">{activeLine.res}</div>}
          </div>

          <div className="player-toolbar">
            <div className="icon-group">
              <select
                aria-label="播放速度"
                value={rate}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setRate(value);
                  if (video.current) video.current.playbackRate = value;
                }}
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}×
                  </option>
                ))}
              </select>
              {tracks.length > 1 && (
                <select
                  aria-label="选择机位"
                  value={track}
                  onChange={(e) => {
                    lastTime.current = video.current?.currentTime || 0;
                    setTrack(Number(e.target.value));
                  }}
                >
                  {tracks.map((_, i) => (
                    <option key={i} value={i}>
                      机位 {i + 1}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="icon-group">
              <RTooltip content="字幕开关">
                <RIconButton
                  size="2"
                  variant={subtitle ? 'soft' : 'ghost'}
                  color={subtitle ? 'indigo' : 'gray'}
                  aria-label="字幕开关"
                  onClick={() => setSubtitle((v) => !v)}
                >
                  <Subtitles size={17} />
                </RIconButton>
              </RTooltip>

              <RTooltip content="视频截图提问">
                <RIconButton
                  size="2"
                  variant="ghost"
                  color="gray"
                  aria-label="视频截图提问"
                  onClick={() => void screenshot()}
                >
                  <Camera size={17} />
                </RIconButton>
              </RTooltip>

              <RTooltip content={showSlide ? '隐藏课件' : '显示课件'}>
                <RIconButton
                  size="2"
                  variant={showSlide ? 'soft' : 'ghost'}
                  color="gray"
                  aria-label="显示或隐藏课件"
                  onClick={() => setShowSlide((v) => !v)}
                >
                  {showSlide ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
                </RIconButton>
              </RTooltip>

              {showSlide && (
                <RTooltip content={floating ? '并排看课件' : '课件小窗'}>
                  <RIconButton
                    size="2"
                    variant="ghost"
                    color="gray"
                    aria-label="切换课件并排或小窗"
                    onClick={() => setFloating((v) => !v)}
                  >
                    <FileText size={17} />
                  </RIconButton>
                </RTooltip>
              )}

              <RTooltip content={full ? '退出全屏' : '全屏学习'}>
                <RIconButton
                  size="2"
                  variant="ghost"
                  color="gray"
                  aria-label="全屏学习"
                  onClick={() => {
                    void (full
                      ? document.exitFullscreen()
                      : frame.current!.requestFullscreen()
                    ).catch(() => onNotice('全屏暂不可用'));
                  }}
                >
                  {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                </RIconButton>
              </RTooltip>
            </div>
          </div>
        </div>
        {showSlide && slidePanel}
      </div>

      {materialError && <ErrorNotice message={materialError} onRetry={() => setRetry((v) => v + 1)} />}

      <div className="material-tabs">
        <RTabs.Root value={tab} onValueChange={(val) => setTab(val as typeof tab)}>
          <RTabs.List className="tabs-list">
            <RTabs.Trigger value="subtitles">字幕</RTabs.Trigger>
            <RTabs.Trigger value="slides">切片目录</RTabs.Trigger>
            <RTabs.Trigger value="notes">时间点笔记</RTabs.Trigger>
          </RTabs.List>
        </RTabs.Root>

        {selected.length > 0 && (
          <RButton
            variant="solid"
            color="indigo"
            size="2"
            onClick={() => openAsk(context())}
          >
            <MessageCircle size={15} />
            <span>问选中 {selected.length} 段</span>
          </RButton>
        )}
      </div>

      {tab === 'subtitles' && (
        <div className="subtitles-list">
          {!lines.length && <Empty title="本节暂无可用字幕" />}
          {lines.map((line, i) => (
            <div
              key={`${line.bg}:${i}`}
              className={`subtitle-row ${activeLine === line ? 'current' : ''} ${
                selected.includes(line.bg) ? 'selected' : ''
              }`}
            >
              <input
                type="checkbox"
                aria-label={`选择 ${S.formatTime(line.bg / 1000)} 字幕`}
                checked={selected.includes(line.bg)}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked ? [...old, line.bg] : old.filter((n) => n !== line.bg)
                  )
                }
              />
              <button className="timestamp" onClick={() => seek(line.bg / 1000)}>
                {S.formatTime(line.bg / 1000)}
              </button>
              <span>{line.res}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'slides' && (
        <div className="slides-grid">
          {!slides.length && <Empty title="本节暂无切片" />}
          {slides.map((s, i) => (
            <button
              className={slideIndex === i ? 'selected' : ''}
              key={`${s.createSec}:${i}`}
              onClick={() => {
                setFollow(false);
                setSlideIndex(i);
                setShowSlide(true);
                seek(Number(s.createSec));
              }}
            >
              <img src={s.pptImgUrl} loading="lazy" alt={`切片 ${i + 1}`} />
              <span>
                {i + 1} · {S.formatTime(Number(s.createSec))}
              </span>
            </button>
          ))}
        </div>
      )}

      {tab === 'notes' && (
        <div className="timestamp-note">
          <label>
            记在 {S.formatTime(position)}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="记下这一刻的理解或疑问…"
            />
          </label>
          <RButton
            variant="solid"
            color="indigo"
            size="2"
            disabled={!note.trim()}
            onClick={() => {
              const value: S.Note = {
                id: crypto.randomUUID(),
                account: accountId,
                title: `${recording.videoName} · ${S.formatTime(position)}`,
                body: note,
                updated: Date.now(),
                source: `${recording.courseName} · ${S.formatTime(position)}`,
              };
              void S.putSaved('notes', value).then(() => {
                setNote('');
                onNotice('已保存到笔记');
              }).catch((e) => onNotice(S.errorText(e)));
            }}
          >
            保存笔记
          </RButton>
        </div>
      )}
    </div>
  );
}
