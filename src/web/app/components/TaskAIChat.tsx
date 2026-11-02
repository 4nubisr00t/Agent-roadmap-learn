import React, { useState, useEffect, useRef } from 'react';
import { renderMarkdown, triggerMermaidRender } from '../utils/markdown.js';
import { SYSTEM_PROMPTS, AISettingsState } from './modals/AISettingsModal.js';
import { IconAI, IconUser, IconBook, IconSend, IconTrash, IconSettings, IconFileText, IconSparkles, IconLightning } from './Icons.js';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  tags?: string[];
}

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface AnnotationItem {
  id: string;
  taskId: string;
  selectedText: string;
  comment: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

interface TaskAIChatProps {
  task: Task;
  project: Project;
  annotations: AnnotationItem[];
  currentUserId?: string;
  onOpenAISettings: () => void;
}

export const TaskAIChat: React.FC<TaskAIChatProps> = ({
  task,
  project,
  annotations,
  currentUserId,
  onOpenAISettings,
}) => {
  const cacheKey = `roadmap_chat_${currentUserId || 'guest'}_${task.id}`;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(cacheKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [activeSettings, setActiveSettings] = useState<AISettingsState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('roadmap_ai_config');
      if (saved) {
        setActiveSettings(JSON.parse(saved));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(cacheKey);
      setMessages(saved ? JSON.parse(saved) : []);
    } catch {
      setMessages([]);
    }
  }, [cacheKey]);

  useEffect(() => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(messages));
      triggerMermaidRender();
    } catch {}
  }, [messages, cacheKey]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamBuffer]);

  const handleClearHistory = () => {
    if (confirm('确认清空当前节点的对话记录吗？')) {
      setMessages([]);
      localStorage.removeItem(cacheKey);
    }
  };

  const handleSend = async (userPromptText?: string) => {
    const textToSend = (userPromptText || input).trim();
    if (!textToSend || isStreaming) return;

    let cfg: AISettingsState | null = activeSettings;
    if (!cfg) {
      try {
        const raw = localStorage.getItem('roadmap_ai_config');
        if (raw) cfg = JSON.parse(raw);
      } catch {}
    }

    if (!cfg || (!cfg.apiKey && cfg.providerId !== 'ollama' && !cfg.baseUrl.includes('localhost'))) {
      if (confirm('尚未配置大模型 API Key！是否现在打开 AI 配置面板？')) {
        onOpenAISettings();
      }
      return;
    }

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: textToSend,
      createdAt: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);
    setStreamBuffer('');

    const taskAnnotations = annotations.filter(a => a.taskId === task.id);
    let systemContent = SYSTEM_PROMPTS.mentor || SYSTEM_PROMPTS.pwn;
    if (cfg.customSystemPrompt) {
      systemContent += `\n\n【学员个性化学习偏好】\n${cfg.customSystemPrompt}`;
    }
    systemContent += `\n\n【当前学习上下文】\n- 路线/技能树：《${project.name}》\n- 当前攻坚节点：【${task.title}】\n- 状态：${task.status}`;
    if (task.description) {
      systemContent += `\n- 节点大纲与核心逻辑：\n${task.description.slice(0, 1500)}`;
    }
    if (taskAnnotations.length > 0) {
      systemContent += `\n- 学员在课件中做的重点批注与思考：\n${taskAnnotations.map((a, i) => `${i + 1}. [重点词句: "${a.selectedText}"] 疑问/心得: "${a.comment}"`).join('\n')}`;
    }

    const apiMessages = [
      { role: 'system', content: systemContent },
      ...newMessages.map(m => ({ role: m.role, content: m.content })),
    ];

    const engine = cfg.mentorEngine || cfg;

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: engine.providerId,
          baseUrl: engine.baseUrl,
          apiKey: engine.apiKey,
          model: engine.model,
          temperature: cfg.temperature ?? 0.7,
          messages: apiMessages,
        }),
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `请求失败 (HTTP ${response.status})`);
      }

      if (!response.body) {
        throw new Error('未接收到可读流');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed === 'data: [DONE]') {
            break;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta?.content || '';
              if (delta) {
                accumulated += delta;
                setStreamBuffer(accumulated);
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      if (accumulated) {
        const botMsg: ChatMessage = {
          id: `ast_${Date.now()}`,
          role: 'assistant',
          content: accumulated,
          createdAt: Date.now(),
        };
        setMessages(prev => [...prev, botMsg]);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `**AI 响应异常**：${err.message || '未知网络错误'}。\n\n请在 [AI 配置] 中检查 API Key 或供应商连接。`,
        createdAt: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsStreaming(false);
      setStreamBuffer('');
    }
  };

  const currentProviderBadge = activeSettings ? (
    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
      {activeSettings.providerId} · {activeSettings.model}
    </span>
  ) : (
    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30">
      未设置 AI 密钥
    </span>
  );

  return (
    <div className="flex flex-col h-[580px] bg-zinc-950/70 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
      {/* Top Bar */}
      <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold">
            <IconAI className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-zinc-100 flex items-center gap-2">
              <span>AI 导师伴学实时对话</span>
              {currentProviderBadge}
            </div>
            <div className="text-[10px] text-zinc-400 font-mono">
              正在学习：【{task.title}】
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              title="清空当前记录"
              className="text-[11px] text-zinc-400 hover:text-rose-400 transition-colors px-2 py-1 rounded active:scale-95"
            >
              清空记录
            </button>
          )}
          <button
            type="button"
            onClick={onOpenAISettings}
            className="px-2.5 py-1 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg transition-all flex items-center gap-1 active:scale-95"
          >
            <IconSettings className="w-3.5 h-3.5 text-amber-400" />
            <span>设置 AI 模型</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-gradient-to-b from-zinc-950/60 to-zinc-900/60">
        {messages.length === 0 && !isStreaming && (
          <div className="py-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
              <IconSparkles className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto">
              <h4 className="text-sm font-black text-zinc-100 tracking-tight">
                与 AI 导师随时发起深度研讨与考核
              </h4>
              <p className="text-xs text-zinc-400 mt-1">
                导师已预先研读本节点的讲义原理、代码段及你的批注。点击下方预设提问或在底部自由输入：
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto text-left pt-2">
              <button
                type="button"
                onClick={() => handleSend('请用通俗生动的比喻，给我讲透本节点的核心机制和底层原理！')}
                className="p-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-amber-500/50 rounded-xl transition-all text-xs font-bold text-zinc-200 shadow-sm active:scale-95 flex items-center gap-2 group"
              >
                <IconBook className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                <span>讲透本节核心机制与底层原理</span>
              </button>

              <button
                type="button"
                onClick={() => handleSend('这部分代码或保护机制最关键的突破口是什么？为什么会产生这种防御特性？')}
                className="p-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-amber-500/50 rounded-xl transition-all text-xs font-bold text-zinc-200 shadow-sm active:scale-95 flex items-center gap-2 group"
              >
                <IconLightning className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                <span>剖析攻防对抗成因与突破口</span>
              </button>

              <button
                type="button"
                onClick={() => handleSend('请出一道结合实战场景的填空或选择测试题考考我，我答对后再通过！')}
                className="p-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-amber-500/50 rounded-xl transition-all text-xs font-bold text-zinc-200 shadow-sm active:scale-95 flex items-center gap-2 group"
              >
                <IconSparkles className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                <span>出一道实战场景考核题考考我</span>
              </button>

              <button
                type="button"
                onClick={() => handleSend('请根据课件内容，总结这节课在实际生产或竞赛中最容易踩的实战大坑。')}
                className="p-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-amber-500/50 rounded-xl transition-all text-xs font-bold text-zinc-200 shadow-sm active:scale-95 flex items-center gap-2 group"
              >
                <IconFileText className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                <span>总结最容易踩的实战误区</span>
              </button>
            </div>
          </div>
        )}

        {/* Message List */}
        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={m.id}
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm">
                  <IconAI className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-zinc-950 shadow-lg shadow-amber-500/10 font-bold'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200 shadow-sm'
                }`}
              >
                {isUser ? (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                ) : (
                  <div
                    className="courseware-content max-w-none text-zinc-200"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                  />
                )}
              </div>
              {isUser && (
                <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 text-amber-400 flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm">
                  <IconUser className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {/* Streaming Buffer */}
        {isStreaming && (
          <div className="flex gap-3 justify-start animate-fadeIn">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm animate-pulse">
              <IconAI className="w-4 h-4" />
            </div>
            <div className="max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed bg-zinc-900 border border-amber-500/40 text-zinc-200 shadow-sm">
              {streamBuffer ? (
                <div
                  className="courseware-content max-w-none text-zinc-200"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(streamBuffer) }}
                />
              ) : (
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>正在深度思考并组织核心解答...</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="p-3.5 bg-zinc-900 border-t border-zinc-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="向导师提出你的疑问或输入答案（回车发送）..."
            disabled={isStreaming}
            className="flex-1 px-4 py-2.5 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 text-zinc-100 placeholder-zinc-500 transition-all font-medium disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-40 text-zinc-950 text-xs font-black rounded-xl transition-all shadow-md shadow-amber-500/20 active:scale-95 flex items-center gap-1.5 flex-shrink-0"
          >
            {isStreaming ? (
              <span className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <IconSend className="w-3.5 h-3.5" />
                <span>发送</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
