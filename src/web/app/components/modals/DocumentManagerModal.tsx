import React, { useState, useEffect } from 'react';
import { IconBook, IconUpload, IconEdit, IconSparkles, IconTrash, IconClose, IconFileText } from '../Icons.js';

export interface UserDocumentSummary {
  id: string;
  userId: string;
  title: string;
  originalName: string;
  fileType: string;
  size: number;
  textLength: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface DocumentManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerateRoadmap: (docId: string, docTitle: string) => void;
}

export const DocumentManagerModal: React.FC<DocumentManagerModalProps> = ({
  isOpen,
  onClose,
  onGenerateRoadmap,
}) => {
  const [documents, setDocuments] = useState<UserDocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');

  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
      setUploadError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'txt';
      const reader = new FileReader();

      if (ext === 'pdf') {
        reader.readAsDataURL(file);
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          await submitDocument({
            title: file.name.replace(/\.[^/.]+$/, ''),
            originalName: file.name,
            fileType: 'pdf',
            base64,
          });
        };
      } else {
        reader.readAsText(file, 'utf-8');
        reader.onload = async () => {
          const content = reader.result as string;
          await submitDocument({
            title: file.name.replace(/\.[^/.]+$/, ''),
            originalName: file.name,
            fileType: ext,
            content,
          });
        };
      }
    } catch (err: any) {
      setUploadError(err.message || '读取文件失败');
      setUploading(false);
    }
  };

  const submitDocument = async (payload: any) => {
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '上传资料失败');
      }

      await loadDocuments();
      setPasteTitle('');
      setPasteContent('');
    } catch (err: any) {
      setUploadError(err.message || '上传异常');
    } finally {
      setUploading(false);
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteTitle.trim() || !pasteContent.trim()) {
      setUploadError('请输入资料标题和具体文本内容');
      return;
    }
    setUploading(true);
    setUploadError('');
    await submitDocument({
      title: pasteTitle.trim(),
      originalName: `${pasteTitle.trim()}.txt`,
      fileType: 'txt',
      content: pasteContent.trim(),
    });
  };

  const handleDelete = async (docId: string, title: string) => {
    if (!confirm(`确认删除学习资料《${title}》吗？`)) return;
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
      }
    } catch (err) {
      console.error('Delete document failed:', err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-800 gold-border-hover animate-slideUp flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <IconBook className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-100 tracking-tight">
                专属学习资料库 (私有投喂空间)
              </h2>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
                上传 PDF 电子书、专业讲义或大纲，一键投喂给 AI 自动架构知识图谱
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors active:scale-95"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Upload Area Box */}
          <div className="bg-zinc-950/80 p-5 rounded-2xl border border-zinc-800 shadow-inner">
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('upload');
                  setUploadError('');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all active:scale-95 flex items-center gap-1.5 ${
                  activeTab === 'upload'
                    ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <IconUpload className="w-3.5 h-3.5 text-amber-400" />
                <span>上传电子书 / 文件 (PDF, MD, TXT, 源码)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('paste');
                  setUploadError('');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all active:scale-95 flex items-center gap-1.5 ${
                  activeTab === 'paste'
                    ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <IconEdit className="w-3.5 h-3.5 text-amber-400" />
                <span>手动录入教材大纲文本</span>
              </button>
            </div>

            {uploadError && (
              <div className="mb-3 p-3 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs font-medium">
                {uploadError}
              </div>
            )}

            {activeTab === 'upload' ? (
              <label className="border-2 border-dashed border-zinc-700/80 hover:border-amber-500/60 bg-zinc-900/60 hover:bg-zinc-900 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all active:scale-[0.99] group">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                  <IconUpload className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-zinc-200 group-hover:text-amber-300 transition-colors">
                  {uploading ? '正在解析并提取教材结构...' : '点击或拖拽文件至此处上传'}
                </span>
                <span className="text-[10px] text-zinc-500 mt-1">
                  支持 PDF 完整电子书、Markdown (.md)、纯文本 (.txt)、源代码 (.c, .asm, .py)
                </span>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.markdown,.json,.c,.cpp,.py,.asm,.rs,.go"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            ) : (
              <form onSubmit={handlePasteSubmit} className="space-y-3">
                <input
                  type="text"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="资料/教材名称（如：逆向工程核心大纲）"
                  className="w-full px-3.5 py-2 text-xs bg-zinc-900 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 text-zinc-100 placeholder-zinc-500"
                />
                <textarea
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="在此粘贴教材章节目录、课程大纲或重点知识点文本..."
                  rows={4}
                  className="w-full px-3.5 py-2 text-xs bg-zinc-900 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 text-zinc-100 placeholder-zinc-500 resize-none font-mono"
                />
                <button
                  type="submit"
                  disabled={uploading || !pasteTitle.trim() || !pasteContent.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-40 text-zinc-950 text-xs font-black rounded-xl transition-all shadow-md shadow-amber-500/20 active:scale-95"
                >
                  {uploading ? '正在存盘...' : '存入我的专属资料库'}
                </button>
              </form>
            )}
          </div>

          {/* Documents List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                已归档资料 ({documents.length})
              </h3>
              <span className="text-[11px] text-zinc-500 font-mono">仅当前登录账户独立持有</span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-zinc-500">正在检索资料索引...</div>
            ) : documents.length === 0 ? (
              <div className="py-8 text-center bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-zinc-500 text-xs flex flex-col items-center justify-center gap-2">
                <IconFileText className="w-8 h-8 text-zinc-600" />
                <span>暂无专属资料，上传你的第一份电子书开始投喂！</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3.5 bg-zinc-950/70 rounded-xl border border-zinc-800 hover:border-amber-500/40 transition-all flex items-center justify-between gap-3 shadow-sm group active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-black text-xs uppercase flex-shrink-0">
                        {doc.fileType.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-zinc-200 truncate group-hover:text-amber-300 transition-colors">
                          {doc.title}
                        </h4>
                        <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5 font-mono">
                          <span>{formatFileSize(doc.size)}</span>
                          <span>•</span>
                          <span>约 {doc.textLength} 字</span>
                          <span>•</span>
                          <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onGenerateRoadmap(doc.id, doc.title);
                          onClose();
                        }}
                        className="px-3 py-1.5 text-xs font-black bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 rounded-lg shadow-sm shadow-amber-500/20 transition-all flex items-center gap-1 active:scale-95"
                      >
                        <IconSparkles className="w-3.5 h-3.5 text-zinc-950" />
                        <span>生成技能树</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id, doc.title)}
                        title="删除该资料"
                        className="w-7 h-7 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 flex items-center justify-center transition-colors active:scale-95"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <span className="text-[11px] text-zinc-500 font-mono">
            隔离机制：所有资料均保存在您个人目录，与其他家庭成员或用户绝对物理隔离
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-xl transition-colors active:scale-95"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
