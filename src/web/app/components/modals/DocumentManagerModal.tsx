import React, { useState, useEffect } from 'react';
import { IconBook, IconUpload, IconEdit, IconSparkles, IconTrash, IconClose, IconFileText, IconLayers } from '../Icons.js';
import { useFeedback } from '../FeedbackProvider.js';

export interface UserDocumentSummary {
  id: string;
  userId: string;
  projectId?: string;
  projectName?: string;
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
  currentProjectId?: string | null;
  projects?: Array<{ project: { id: string; name: string } }>;
  onGenerateRoadmap: (docId: string, docTitle: string) => void;
}

export const DocumentManagerModal: React.FC<DocumentManagerModalProps> = ({
  isOpen,
  onClose,
  currentProjectId,
  projects = [],
  onGenerateRoadmap,
}) => {
  const [documents, setDocuments] = useState<UserDocumentSummary[]>([]);
  const { toast, confirm } = useFeedback();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  
  // Project-level filtering & assignment
  const [filterMode, setFilterMode] = useState<'current' | 'all' | 'universal'>('current');
  const [targetProjectId, setTargetProjectId] = useState<string>('');

  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const activeProject = projects.find(p => p.project.id === currentProjectId)?.project;

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
      setUploadSuccessMessage('');
      setUploadProgress(0);
      if (currentProjectId) {
        setTargetProjectId(currentProjectId);
        setFilterMode('current');
      } else {
        setFilterMode('all');
      }
    }
  }, [isOpen, currentProjectId]);

  if (!isOpen) return null;

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  };

  const formatEta = (seconds: number) => {
    if (!isFinite(seconds) || seconds <= 0) return '计算中...';
    if (seconds < 60) return `${Math.ceil(seconds)} 秒`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins} 分 ${secs} 秒`;
  };

  const submitPastedDocument = async (payload: any) => {
    setUploading(true);
    setUploadProgress(15);
    const displayName = payload.originalName || payload.title;
    setUploadStatusText(`正在将《${displayName}》存入知识库空间...`);

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/documents');
      xhr.setRequestHeader('Content-Type', 'application/json');

      const token = localStorage.getItem('roadmap_auth_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          setUploadProgress(percent);
          setUploadStatusText(`正在上传《${displayName}》至知识库 (${percent}%)...`);
        }
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          setUploadStatusText(`《${displayName}》已安全存入知识库！`);
          setUploadSuccessMessage(`《${displayName}》已成功存入项目知识库空间！仅做资料安全存盘，未消耗 Token 解析；您可随时在下方列表点击【✨ AI 读教材构建图谱】开始构建。`);
          await loadDocuments();
          setPasteTitle('');
          setPasteContent('');
          setTimeout(() => {
            setUploading(false);
            setUploadProgress(0);
          }, 1200);
          resolve();
        } else {
          let errMsg = '上传资料失败';
          try {
            const err = JSON.parse(xhr.responseText);
            errMsg = err.error || errMsg;
          } catch {}
          setUploadError(errMsg);
          setUploading(false);
          reject(new Error(errMsg));
        }
      };

      xhr.onerror = () => {
        setUploadError('网络连接异常，上传中断');
        setUploading(false);
        reject(new Error('网络连接异常'));
      };

      xhr.send(JSON.stringify(payload));
    });
  };

  /**
   * Upload a single chunk with retry capability
   */
  const uploadSingleChunk = (
    uploadId: string,
    chunkIndex: number,
    totalChunks: number,
    chunkBlob: Blob,
    maxRetries = 3
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const attemptUpload = (attempt: number) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/documents/upload-chunk');

        const token = localStorage.getItem('roadmap_auth_token');
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        const formData = new FormData();
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('chunk', chunkBlob, `chunk_${chunkIndex}`);

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            if (attempt < maxRetries) {
              setTimeout(() => attemptUpload(attempt + 1), 600 * attempt);
            } else {
              reject(new Error(`分片 ${chunkIndex + 1}/${totalChunks} 上传失败 (HTTP ${xhr.status})`));
            }
          }
        };

        xhr.onerror = () => {
          if (attempt < maxRetries) {
            setTimeout(() => attemptUpload(attempt + 1), 600 * attempt);
          } else {
            reject(new Error(`分片 ${chunkIndex + 1}/${totalChunks} 网络传输中断`));
          }
        };

        xhr.ontimeout = () => {
          if (attempt < maxRetries) {
            setTimeout(() => attemptUpload(attempt + 1), 600 * attempt);
          } else {
            reject(new Error(`分片 ${chunkIndex + 1}/${totalChunks} 请求超时`));
          }
        };

        xhr.timeout = 45000; // 45s per chunk (1MB never exceeds 45s even on slow link)
        xhr.send(formData);
      };

      attemptUpload(1);
    });
  };

  /**
   * Multi-channel Concurrent Chunked Upload for reliable large file uploads
   */
  const uploadFileMultiChannel = async (file: File) => {
    setUploading(true);
    setUploadError('');
    setUploadSuccessMessage('');
    setUploadProgress(0);

    const boundProj = projects.find(p => p.project.id === targetProjectId)?.project;
    const CHUNK_SIZE = 1024 * 1024; // 1MB per chunk
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    setUploadStatusText(`正在准备多通道切片上传《${file.name}》(共 ${totalChunks} 片)...`);

    // For very small files (< 1.5MB), fallback to single request for lowest overhead
    if (file.size <= 1.5 * 1024 * 1024) {
      return uploadFileDirectly(file);
    }

    const CONCURRENCY = 3; // 3 concurrent channels
    let completedChunks = 0;
    let uploadedBytes = 0;
    const startTime = Date.now();

    // Prepare chunk tasks
    const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);
    let nextIndexPtr = 0;

    const runWorker = async (_channelId: number): Promise<void> => {
      while (nextIndexPtr < chunkIndices.length) {
        const currentIndex = nextIndexPtr++;
        const start = currentIndex * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);

        await uploadSingleChunk(uploadId, currentIndex, totalChunks, chunkBlob);

        completedChunks++;
        uploadedBytes += (end - start);

        const percent = Math.min(99, Math.round((completedChunks / totalChunks) * 100));
        const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
        const speed = uploadedBytes / elapsedSec;
        const remainingBytes = file.size - uploadedBytes;
        const eta = remainingBytes / (speed || 1);

        setUploadProgress(percent);
        setUploadStatusText(
          `🚀 多通道传输: ${completedChunks}/${totalChunks} 片 (${percent}%) • ${formatSpeed(speed)} • 剩余约 ${formatEta(eta)}`
        );
      }
    };

    try {
      // Launch concurrent worker channels
      const workers = Array.from({ length: Math.min(CONCURRENCY, totalChunks) }, (_, i) => runWorker(i + 1));
      await Promise.all(workers);

      // All chunks uploaded, invoke merge endpoint
      setUploadProgress(99);
      setUploadStatusText('⚡ 分片已全部传输完毕，正在流式合成入库...');

      const mergeRes = await fetch('/api/documents/merge-chunks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('roadmap_auth_token')
            ? { Authorization: `Bearer ${localStorage.getItem('roadmap_auth_token')}` }
            : {}),
        },
        body: JSON.stringify({
          uploadId,
          totalChunks,
          originalName: file.name,
          fileType: (file.name.split('.').pop() || 'pdf').toLowerCase(),
          title: file.name.replace(/\.[^/.]+$/, ''),
          projectId: targetProjectId || undefined,
          projectName: boundProj?.name || undefined,
        }),
      });

      if (!mergeRes.ok) {
        const errJson = await mergeRes.json().catch(() => ({}));
        throw new Error(errJson.error || '分片合并存盘失败');
      }

      setUploadProgress(100);
      setUploadStatusText(`《${file.name}》已安全存入知识库！`);
      setUploadSuccessMessage(
        `《${file.name}》多通道切片上传完成，原件已完整安全存盘！未消耗 Token，您可随时在下方列表点击【✨ AI 读教材构建图谱】随时构建。`
      );
      await loadDocuments();

      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 1500);
    } catch (err: any) {
      console.error('Multi-channel upload error:', err);
      setUploadError(err.message || '分片上传出现异常，请重试');
      setUploading(false);
    }
  };

  const uploadFileDirectly = async (file: File) => {
    setUploading(true);
    setUploadError('');
    setUploadSuccessMessage('');
    setUploadProgress(5);
    setUploadStatusText(`正在上传《${file.name}》至专属知识库...`);

    const boundProj = projects.find(p => p.project.id === targetProjectId)?.project;
    const formData = new FormData();
    formData.append('file', file);
    if (targetProjectId) {
      formData.append('projectId', targetProjectId);
    }
    if (boundProj?.name) {
      formData.append('projectName', boundProj.name);
    }
    formData.append('title', file.name.replace(/\.[^/.]+$/, ''));

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/documents/upload');

      const token = localStorage.getItem('roadmap_auth_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          setUploadProgress(percent);
          setUploadStatusText(`正在极速上传《${file.name}》(${percent}%)...`);
        }
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          setUploadStatusText(`《${file.name}》已安全存入知识库！`);
          setUploadSuccessMessage(`《${file.name}》已成功存入项目知识库空间！仅做资料安全存盘，未消耗 Token 解析；您可随时在下方列表点击【✨ AI 读教材构建图谱】开始构建。`);
          await loadDocuments();
          setTimeout(() => {
            setUploading(false);
            setUploadProgress(0);
          }, 1200);
          resolve();
        } else {
          let errMsg = '上传资料失败';
          try {
            const err = JSON.parse(xhr.responseText);
            errMsg = err.error || errMsg;
          } catch {}
          setUploadError(errMsg);
          setUploading(false);
          reject(new Error(errMsg));
        }
      };

      xhr.onerror = () => {
        setUploadError('网络连接异常或上传中断，请检查网络后重试');
        setUploading(false);
        reject(new Error('网络连接异常'));
      };

      xhr.ontimeout = () => {
        setUploadError('上传超时，文件可能过大或网络不稳定');
        setUploading(false);
        reject(new Error('上传超时'));
      };

      xhr.send(formData);
    });
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      await uploadFileMultiChannel(file);
    } catch (err: any) {
      console.error('File upload failed:', err);
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteTitle.trim() || !pasteContent.trim()) {
      setUploadError('请输入资料标题和具体文本内容');
      return;
    }
    const boundProj = projects.find(p => p.project.id === targetProjectId)?.project;

    setUploading(true);
    setUploadError('');
    setUploadSuccessMessage('');
    await submitPastedDocument({
      projectId: targetProjectId || undefined,
      projectName: boundProj?.name || undefined,
      title: pasteTitle.trim(),
      originalName: `${pasteTitle.trim()}.txt`,
      fileType: 'txt',
      content: pasteContent.trim(),
    });
  };

  const handleReassignProject = async (docId: string, newProjId: string) => {
    const boundProj = projects.find(p => p.project.id === newProjId)?.project;
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: newProjId || null,
          projectName: boundProj?.name || null,
        }),
      });
      if (res.ok) {
        await loadDocuments();
      }
    } catch (err) {
      console.error('Failed to reassign document project:', err);
    }
  };

  const handleDelete = async (docId: string, title: string) => {
    const ok = await confirm({
      title: '删除学习资料',
      message: `确认删除学习资料《${title}》吗？删除后将无法继续用于章节 RAG 检索。`,
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
        toast.success(`已删除《${title}》`);
      }
    } catch (err) {
      console.error('Delete document failed:', err);
      toast.error('删除资料失败，请重试');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filtered documents according to user selection
  const filteredDocuments = documents.filter((doc) => {
    if (filterMode === 'current' && currentProjectId) {
      return doc.projectId === currentProjectId;
    }
    if (filterMode === 'universal') {
      return !doc.projectId;
    }
    return true;
  });

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-2 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-zinc-800 gold-border-hover animate-slideUp flex flex-col max-h-[96vh] sm:max-h-[92vh]">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10 flex-shrink-0">
              <IconBook className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-xs sm:text-base font-black text-zinc-100 tracking-tight truncate">
                  专属学习资料库 (教材管理)
                </h2>
                {activeProject && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 max-w-[150px] sm:max-w-xs truncate">
                    <IconLayers className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">{activeProject.name}</span>
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-zinc-400 font-medium hidden sm:block mt-0.5">
                支持按用户账号物理隔离，并按您建立的不同项目/技能树分流专属教材知识库
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors active:scale-95 flex-shrink-0 ml-2"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto overflow-x-hidden flex-1">
          {/* Upload Area Box */}
          <div className="bg-zinc-950/80 p-3.5 sm:p-5 rounded-2xl border border-zinc-800 shadow-inner space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-zinc-800/80">
              <div className="flex gap-1.5">
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
                  <span>上传电子书 / 文件</span>
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
                  <span>手动录入大纲</span>
                </button>
              </div>

              {/* Project Assignment Dropdown */}
              <div className="flex items-center gap-1.5 bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-800">
                <span className="text-[11px] font-bold text-zinc-400 whitespace-nowrap">归属项目:</span>
                <select
                  value={targetProjectId}
                  onChange={(e) => setTargetProjectId(e.target.value)}
                  className="w-full sm:w-auto bg-zinc-900 border-0 text-xs text-amber-300 font-bold focus:outline-none truncate"
                >
                  <option value="">🌐 全局通用 (不限项目)</option>
                  {projects.map((p) => (
                    <option key={p.project.id} value={p.project.id}>
                      📁 {p.project.name} {p.project.id === currentProjectId ? '(当前项目)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs font-medium animate-fadeIn">
                {uploadError}
              </div>
            )}

            {uploadSuccessMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center justify-between gap-2 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <span>{uploadSuccessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadSuccessMessage('')}
                  className="text-emerald-400 hover:text-emerald-100 font-bold px-2 py-0.5 rounded hover:bg-emerald-950/40 text-sm"
                >
                  ×
                </button>
              </div>
            )}

            {activeTab === 'upload' ? (
              <div className="relative border-2 border-dashed border-zinc-700/80 hover:border-amber-500/60 bg-zinc-900/60 rounded-xl p-4 sm:p-7 flex flex-col items-center justify-center transition-all group overflow-hidden">
                {/* Native file input overlaying entire box so any mobile tap triggers file dialog */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.markdown,.json,.c,.cpp,.py,.asm,.rs,.go,text/*,application/pdf"
                  onChange={handleFileInputChange}
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  aria-label="选择文件上传到知识库"
                />

                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform pointer-events-none">
                  <IconUpload className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>

                <div className="text-center pointer-events-none space-y-1">
                  <span className="text-xs sm:text-sm font-black text-zinc-100 group-hover:text-amber-300 transition-colors block">
                    {uploading ? uploadStatusText : '点击此处选择文件 或 拖拽至此处上传'}
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-zinc-400 block max-w-md mx-auto">
                    支持各类电子书与源码 (PDF、TXT、Markdown 等)，多通道分块传输，安全存盘不消耗 Token
                  </span>
                </div>

                {/* Explicit Touch Friendly Button for Mobile */}
                <div className="mt-3 z-20">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    disabled={uploading}
                    className="px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-yellow-500/20 hover:from-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-black flex items-center gap-2 shadow-sm transition-all active:scale-95"
                  >
                    <IconUpload className="w-3.5 h-3.5 text-amber-400" />
                    <span>{uploading ? '分片上传处理中...' : '📱 点此选取手机/电脑文件'}</span>
                  </button>
                </div>

                {uploading && (
                  <div className="w-full max-w-md mt-3 space-y-1.5 animate-fadeIn z-20">
                    <div className="flex justify-between items-center text-[11px] text-amber-300 font-bold">
                      <span className="truncate pr-2 font-mono text-[10px] sm:text-[11px]">{uploadStatusText}</span>
                      <span className="font-mono text-amber-400 flex-shrink-0">{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-zinc-700">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300 rounded-full transition-all duration-300 shadow-sm shadow-amber-500/30"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
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
                  {uploading ? uploadStatusText : '存入知识库空间'}
                </button>
              </form>
            )}
          </div>

          {/* Documents List & Scope Filter */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-1 bg-zinc-950/70 p-1 rounded-xl border border-zinc-800 overflow-x-auto no-scrollbar max-w-full">
                {activeProject && (
                  <button
                    type="button"
                    onClick={() => setFilterMode('current')}
                    className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                      filterMode === 'current'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    📁 当前项目 ({documents.filter(d => d.projectId === currentProjectId).length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                    filterMode === 'all'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  🌐 全部资料 ({documents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('universal')}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                    filterMode === 'universal'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  📦 未分配 ({documents.filter(d => !d.projectId).length})
                </button>
              </div>

              <span className="text-[11px] text-zinc-500 font-mono self-end sm:self-auto">
                共 {filteredDocuments.length} 份资料
              </span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-zinc-500">正在检索资料索引...</div>
            ) : filteredDocuments.length === 0 ? (
              <div className="py-8 text-center bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-zinc-500 text-xs flex flex-col items-center justify-center gap-2">
                <IconFileText className="w-8 h-8 text-zinc-600" />
                <span>当前分类下暂无专属资料，可上传文件并指派归属于此项目！</span>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3.5 sm:p-4 bg-zinc-950/85 rounded-xl border border-zinc-800 hover:border-amber-500/40 transition-all flex flex-col gap-3 shadow-md group"
                  >
                    {/* Part 1: File Meta Info (Top Area: File icon + Title + Project Badge + Details) */}
                    <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-black text-xs uppercase flex-shrink-0 mt-0.5 shadow-sm">
                        {doc.fileType.slice(0, 3)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <h4 className="text-xs sm:text-sm font-black text-zinc-100 group-hover:text-amber-300 transition-colors leading-snug break-words">
                            {doc.title}
                          </h4>
                          {doc.projectId ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex-shrink-0">
                              📁 {doc.projectName || '专属项目'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 flex-shrink-0">
                              🌐 全局通用
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-zinc-400 flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1.5 font-mono">
                          <span className="text-amber-400/90 font-bold">{formatFileSize(doc.size)}</span>
                          <span>•</span>
                          <span>约 {doc.textLength} 字</span>
                          <span>•</span>
                          <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Part 2: Independent Action Bar (Bottom Area: Reassign Select + Full-width / Robust Action Buttons) */}
                    <div className="pt-2.5 border-t border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      {/* Project Reassign Quick Dropdown */}
                      <div className="flex items-center gap-1.5 w-full sm:w-auto">
                        <span className="text-[10px] sm:text-[11px] text-zinc-500 font-medium whitespace-nowrap">
                          转入项目:
                        </span>
                        <select
                          value={doc.projectId || ''}
                          onChange={(e) => handleReassignProject(doc.id, e.target.value)}
                          className="flex-1 sm:w-auto sm:max-w-[160px] bg-zinc-900 border border-zinc-750 text-zinc-300 hover:text-amber-300 rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none truncate"
                          title="切换该资料归属的项目知识库"
                        >
                          <option value="">🌐 全局通用</option>
                          {projects.map((p) => (
                            <option key={p.project.id} value={p.project.id}>
                              📁 {p.project.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        {/* Primary Build Graph Button */}
                        <button
                          type="button"
                          onClick={() => {
                            onGenerateRoadmap(doc.id, doc.title);
                            onClose();
                          }}
                          className="flex-1 sm:flex-initial px-3.5 py-1.5 sm:py-2 text-xs font-black bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-zinc-950 rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                          title="点击此按钮后，AI 才开始研读本教材并构建专属知识图谱"
                        >
                          <IconSparkles className="w-3.5 h-3.5 text-zinc-950 flex-shrink-0" />
                          <span>✨ AI 读教材构建图谱</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDelete(doc.id, doc.title)}
                          title="删除该资料"
                          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 hover:border-rose-800/50 flex items-center justify-center transition-colors active:scale-95 flex-shrink-0"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-950/80 flex-shrink-0">
          <span className="text-[10px] sm:text-[11px] text-zinc-500 font-mono truncate mr-2">
            隔离机制：用户间绝对物理隔离，资料按技能树划分
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 sm:py-2 text-xs font-black bg-zinc-800 hover:bg-zinc-750 text-zinc-200 rounded-xl transition-colors active:scale-95 flex-shrink-0"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
