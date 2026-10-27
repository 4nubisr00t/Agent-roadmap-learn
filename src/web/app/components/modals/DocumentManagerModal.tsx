import React, { useState, useEffect } from 'react';

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

  // Paste text state
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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 animate-slideUp flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold text-base border border-teal-500/20">
              📚
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">
                我的个人资料库 (私有投喂空间)
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                上传电子书、教程笔记或大纲，可投喂给 AI 自动生成专属学习技能树
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Upload Area Box */}
          <div className="bg-gradient-to-br from-teal-50/50 via-slate-50 to-emerald-50/40 p-4 rounded-2xl border border-teal-100">
            {/* Tabs */}
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('upload');
                  setUploadError('');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'upload'
                    ? 'bg-white text-teal-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📁 上传电子书/文档 (PDF/MD/TXT/代码)
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('paste');
                  setUploadError('');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'paste'
                    ? 'bg-white text-teal-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                ✏️ 手动粘贴教材大纲/文本
              </button>
            </div>

            {uploadError && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                ⚠️ {uploadError}
              </div>
            )}

            {activeTab === 'upload' ? (
              <label className="border-2 border-dashed border-teal-300 hover:border-teal-500 bg-white/70 hover:bg-white rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all">
                <span className="text-3xl mb-1">📤</span>
                <span className="text-xs font-bold text-slate-700">
                  {uploading ? '正在读取与提取文本...' : '点击或拖拽文件到此处上传'}
                </span>
                <span className="text-[10px] text-slate-400 mt-1">
                  支持 PDF 电子书、Markdown (.md)、纯文本 (.txt)、源代码 (.c, .py, .asm)
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
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <textarea
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="在此粘贴教材章节目录、课程核心大纲或学习笔记内容..."
                  rows={4}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none font-mono"
                />
                <button
                  type="submit"
                  disabled={uploading || !pasteTitle.trim() || !pasteContent.trim()}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow-sm shadow-teal-600/20"
                >
                  {uploading ? '正在存盘...' : '保存至我的资料库'}
                </button>
              </form>
            )}
          </div>

          {/* Documents List */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
              <span>已上传资料列表 ({documents.length})</span>
              <span className="text-[11px] font-normal text-slate-400">仅当前账号独立可见</span>
            </h3>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">加载资料中...</div>
            ) : documents.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-200/60 text-slate-400 text-xs">
                📭 暂无专属资料，欢迎上传第一份教材开始投喂！
              </div>
            ) : (
              <div className="space-y-2.5">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3.5 bg-white rounded-xl border border-slate-200 hover:border-teal-300 transition-all flex items-center justify-between gap-3 shadow-sm group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/70 flex items-center justify-center font-black text-xs uppercase flex-shrink-0">
                        {doc.fileType.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 truncate">
                          {doc.title}
                        </h4>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
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
                        className="px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg shadow-sm shadow-emerald-600/20 transition-all flex items-center gap-1 active:scale-95"
                      >
                        <span>✨</span>
                        <span>生成技能树</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id, doc.title)}
                        title="删除该资料"
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors text-xs"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-[11px] text-slate-400">
            🔒 所有资料均保存在您个人目录，与其他家庭成员或用户绝对物理隔离
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
