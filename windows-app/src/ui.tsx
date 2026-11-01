import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Button, Callout, Flex, Box, Text, Heading, Spinner } from '@radix-ui/themes';
import { ArrowLeft, AlertCircle, Inbox, Video } from 'lucide-react';
import 'katex/dist/katex.min.css';

export function Markdown({
  text,
  onSeek,
}: {
  text: string;
  onSeek?: (seconds: number, resource: string) => void;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith('#video=') ? (
              onSeek ? (
                <button
                  type="button"
                  className="citation"
                  onClick={() => {
                    const params = new URLSearchParams(href.slice(1));
                    const seconds = Number(params.get('t'));
                    if (Number.isFinite(seconds)) {
                      onSeek(seconds, params.get('video') || '');
                    }
                  }}
                >
                  <Video size={12} className="citation-icon" />
                  <span>{children}</span>
                </button>
              ) : (
                <span className="citation">
                  <Video size={12} className="citation-icon" />
                  <span>{children}</span>
                </span>
              )
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Flex direction="column" align="center" justify="center" className="empty-state" gap="3">
      <div className="empty-state-icon-wrapper">
        <Inbox size={26} strokeWidth={1.75} />
      </div>
      <Heading size="3" weight="medium" className="empty-state-title">
        {title}
      </Heading>
      {description && (
        <Text size="2" color="gray" className="empty-state-desc">
          {description}
        </Text>
      )}
      {action && <Box pt="2">{action}</Box>}
    </Flex>
  );
}

export function Loading({ label = '正在读取…' }: { label?: string }) {
  return (
    <Flex align="center" justify="center" gap="3" className="loading-state" role="status">
      <Spinner size="3" />
      <Text size="2" color="gray" weight="medium" className="loading-state-label">
        {label}
      </Text>
    </Flex>
  );
}

export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Callout.Root color="amber" variant="surface" className="error-notice" role="alert">
      <Callout.Icon>
        <AlertCircle size={18} />
      </Callout.Icon>
      <Callout.Text className="error-notice-text">
        <Flex justify="between" align="center" gap="3" wrap="wrap" style={{ width: '100%' }}>
          <span>{message}</span>
          {onRetry && (
            <Button
              size="1"
              variant="soft"
              color="amber"
              className="error-notice-retry"
              onClick={onRetry}
            >
              重试
            </Button>
          )}
        </Flex>
      </Callout.Text>
    </Callout.Root>
  );
}

export function Back({
  onClick,
  label = '返回',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      variant="soft"
      color="gray"
      size="2"
      className="back-button"
      onClick={onClick}
    >
      <ArrowLeft size={15} />
      <span>{label}</span>
    </Button>
  );
}
