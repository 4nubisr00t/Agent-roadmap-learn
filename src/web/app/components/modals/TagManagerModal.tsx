import React, { useState } from 'react';
import TagBadge from '../TagBadge.js';
import ColorPicker from '../ColorPicker.js';
import { IconPin, IconClose, IconPlus, IconTrash, IconEdit, IconCheck } from '../Icons.js';
import { useFeedback } from '../FeedbackProvider.js';

interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt?: string;
  taskCount?: number;
}

interface TagManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  tags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
}

const TagManagerModal: React.FC<TagManagerModalProps> = ({
  isOpen,
  onClose,
  projectId,
  tags,
  onTagsChange,
}) => {
  const { toast, confirm } = useFeedback();
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#F59E0B');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [editingTagColor, setEditingTagColor] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTagName.trim(),
          color: newTagColor,
        }),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          onTagsChange([...tags, result.data]);
          setNewTagName('');
          setNewTagColor('#F59E0B');
        }
      }
    } catch (error) {
      console.error('Failed to create tag:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTag = async (tagId: string) => {
    if (!editingTagName.trim()) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tags/${tagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingTagName.trim(),
          color: editingTagColor,
        }),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          onTagsChange(tags.map(t => t.id === tagId ? result.data : t));
          setEditingTagId(null);
        }
      }
    } catch (error) {
      console.error('Failed to update tag:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    const ok = await confirm({
      title: '删除知识标签',
      message: '确定要删除此标签吗？关联节点上的该标签引用也将同步移除。',
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tags/${tagId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          onTagsChange(tags.filter(t => t.id !== tagId));
          toast.success('标签已删除');
        }
      }
    } catch (error) {
      console.error('Failed to delete tag:', error);
      toast.error('删除标签失败');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
    setEditingTagColor(tag.color);
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92dvh] pb-safe flex flex-col overflow-hidden animate-sheet-mobile border border-zinc-750 text-zinc-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <IconPin className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-black text-zinc-100 tracking-tight">知识标签管理</h2>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 active:scale-95 transition-all"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Create New Tag */}
          <section className="space-y-3">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest">创建新标签</h3>
            <div className="bg-zinc-950/80 p-4 rounded-xl space-y-3 border border-zinc-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="标签名称..."
                  className="flex-1 px-3.5 py-2 bg-zinc-900 border border-zinc-750 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 text-xs text-zinc-100 placeholder-zinc-500 font-medium"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                />
                <button
                  onClick={handleCreateTag}
                  disabled={isLoading || !newTagName.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 rounded-xl hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 flex items-center gap-1.5"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  <span>添加</span>
                </button>
              </div>
              <ColorPicker 
                selectedColor={newTagColor} 
                onChange={setNewTagColor}
                className="pt-1"
              />
            </div>
          </section>

          {/* Tag List */}
          <section className="space-y-3">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest">
              已有标签 ({tags.length})
            </h3>
            <div className="space-y-2">
              {tags.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
                  暂无自定义标签
                </div>
              ) : (
                tags.map((tag) => (
                  <div 
                    key={tag.id}
                    className="flex items-center justify-between p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl hover:border-amber-500/40 transition-all group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {editingTagId === tag.id ? (
                        <div className="flex flex-col gap-2 w-full mr-4">
                          <input
                            type="text"
                            value={editingTagName}
                            onChange={(e) => setEditingTagName(e.target.value)}
                            className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs text-zinc-100"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateTag(tag.id)}
                          />
                          <ColorPicker 
                            selectedColor={editingTagColor} 
                            onChange={setEditingTagColor}
                          />
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleUpdateTag(tag.id)}
                              className="text-xs bg-amber-400 text-zinc-950 font-black px-3 py-1 rounded-lg active:scale-95 transition-all"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingTagId(null)}
                              className="text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-200 px-3 py-1 rounded-lg active:scale-95 transition-all"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <TagBadge name={tag.name} color={tag.color} variant="soft" />
                          <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full font-bold">
                            {tag.taskCount || 0} 模块
                          </span>
                        </>
                      )}
                    </div>
                    
                    {editingTagId !== tag.id && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditing(tag)}
                          className="p-1.5 text-zinc-400 hover:text-amber-300 hover:bg-zinc-800 rounded-lg transition-colors active:scale-95"
                          title="编辑标签"
                        >
                          <IconEdit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTag(tag.id)}
                          className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded-lg transition-colors active:scale-95"
                          title="删除标签"
                        >
                          <IconTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-950/60 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-750 hover:text-zinc-100 rounded-xl transition-all font-bold text-xs active:scale-95"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default TagManagerModal;