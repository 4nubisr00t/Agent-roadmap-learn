import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { SYSTEM_PROMPTS, AISettingsState } from './modals/AISettingsModal.js';

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

  // Reload messages when task or user changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(cacheKey);
      setMessages(saved ? JSON.parse(saved) : []);
    } catch {
      setMessages([]);
    }
  }, [cacheKey]);

  // Save messages per task and user
  useEffect(() => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(messages));
    } catch {}
  }, [messages, cacheKey]);

  const handleClearHistory = () => {
    if (confirm('确认清空当前节点的对话记录吗？')) {
      setMessages([]);
      localStorage.removeItem(cacheKey);
    }
  };

  const handleSend = async (userPromptText?: string) => {
    const textToSend = (userPromptText || input).trim();
    if (!textToSend || isStreaming) return;

    // Check config
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

    // Prepare system context
    const taskAnnotations = annotations.filter(a => a.taskId === task.id);
    let systemContent = SYSTEM_PROMPTS[cfg.systemPromptPreset as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.pwn;
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

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: cfg.providerId,
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.model,
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

      // Append assistant message
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
        content: `⚠️ **AI 响应异常**：${err.message || '未知网络错误'}。\n\n请检查你的 [AI 配置] 是否正确或 API 额度是否充足以继续。`,
        createdAt: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsStreaming(false);
      setStreamBuffer('');
    }
  };

  const currentProviderBadge = activeSettings ? (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
      ⚡ {activeSettings.providerId} · {activeSettings.model}
    </span>
  ) : (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
      ⚠️ 未配置 API Key
    </span>
  );

  return (
    <div className="flex flex-col h-[580px] bg-slate-50/50 rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
      {/* Top Bar */}
      <div className="px-4 py-3 bg-white border-b border-slate-200/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <div>
            <div className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <span>AI 导师伴学实时问答</span>
              {currentProviderBadge}
            </div>
            <div className="text-[10px] text-slate-400">
              已挂载上下文：【{task.title}】
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              title="清空当前记录"
              className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors p-1"
            >
              清空
            </button>
          )}
          <button
            type="button"
            onClick={onOpenAISettings}
            className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all flex items-center gap-1"
          >
            <span>⚙️</span>
            <span>切换/配置供应商</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-gradient-to-b from-white to-slate-50">
        {messages.length === 0 && !isStreaming && (
          <div className="py-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-2xl flex items-center justify-center mx-auto text-indigo-600 shadow-sm">
              💡
            </div>
            <div className="max-w-md mx-auto">
              <h4 className="text-sm font-black text-slate-800">
                向 AI 导师随时发起提问与考核
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                导师已通读本节点的课件原理、代码与你的批注。点击下方预设问题或直接在底部输入即可交流：
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto text-left pt-2">
              <button
                type="button"
                onClick={() => handleSend('请用通俗生动的比喻，给我讲透本节点的核心机制和本质原理！')}
                className="p-3 bg-white hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all text-xs font-bold text-slate-700 shadow-sm"
              >
                <span>📖 讲透本节核心机制与原理</span>
              </button>

              <button
                type="button"
                onClick={() => handleSend('这部分代码或保护机制最关键的突破口是什么？为什么会产生这种防御特性？')}
                className="p-3 bg-white hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all text-xs font-bold text-slate-700 shadow-sm"
              >
                <span>🔍 剖析底层攻防与成因</span>
              </button>

              <button
                type="button"
                onClick={() => handleSend('请出一道结合实际场景的填空或选择测试题考考我，我答对后再通过！')}
                className="p-3 bg-white hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all text-xs font-bold text-slate-700 shadow-sm"
              >
                <span>🎯 出一道场景题考考我</span>
              </button>

              <button
                type="button"
                onClick={() => handleSend('请根据课件内容，总结这节课在实际 CTF 或生产攻防中最容易踩的坑。')}
                className="p-3 bg-white hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all text-xs font-bold text-slate-700 shadow-sm"
              >
                <span>⚠️ 总结最容易踩的实战大坑</span>
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
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm">
                  🤖
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/10 font-medium'
                    : 'bg-white border border-slate-200/80 text-slate-800 shadow-sm'
                }`}
              >
                {isUser ? (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                ) : (
                  <div
                    className="prose prose-xs max-w-none text-slate-800"
                    dangerouslySetInnerHTML={{ __html: marked.parse(m.content) as string }}
                  />
                )}
              </div>
              {isUser && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm">
                  👤
                </div>
              )}
            </div>
          );
        })}

        {/* Streaming Buffer Bubble */}
        {isStreaming && (
          <div className="flex gap-3 justify-start animate-fadeIn">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm animate-pulse">
              🤖
            </div>
            <div className="max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed bg-white border border-indigo-200 text-slate-800 shadow-sm">
              {streamBuffer ? (
                <div
                  className="prose prose-xs max-w-none text-slate-800"
                  dangerouslySetInnerHTML={{ __html: marked.parse(streamBuffer) as string }}
                />
              ) : (
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                  <span>正在思考与整理知识点...</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="p-3 bg-white border-t border-slate-200/80">
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
            placeholder="输入你的疑问或指令（按 Enter 发送）..."
            disabled={isStreaming}
            className="flex-1 px-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/20 active:scale-95 flex items-center gap-1.5 flex-shrink-0"
          >
            {isStreaming ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span>发送 🚀</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
