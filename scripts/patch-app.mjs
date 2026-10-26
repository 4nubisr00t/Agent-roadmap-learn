import fs from 'fs';

const filePath = 'e:/Learn/roadmap-skill/src/web/app/App.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add AnnotationItem interface
const interfaceCode = `export interface AnnotationItem {
  id: string;
  taskId: string;
  taskTitle: string;
  selectedText: string;
  comment: string;
  createdAt: string;
  status?: string;
}

`;

content = content.replace('const App: React.FC = () => {', interfaceCode + 'const App: React.FC = () => {');

// 2. Add annotation states
const stateOld = `  const [modalActiveTab, setModalActiveTab] = useState<'courseware' | 'notes' | 'gemini'>('courseware');`;
const stateNew = `  const [modalActiveTab, setModalActiveTab] = useState<'courseware' | 'notes' | 'gemini' | 'annotations'>('courseware');
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [selectedHighlight, setSelectedHighlight] = useState<{ text: string; x: number; y: number } | null>(null);
  const [isAnnotationModalOpen, setIsAnnotationModalOpen] = useState(false);
  const [annotationComment, setAnnotationComment] = useState('');`;

content = content.replace(stateOld, stateNew);

// 3. Add fetchAnnotations call in mount useEffect
const mountOld = `    if (savedViewPreferences?.workspaceMode) {
      setWorkspaceMode(savedViewPreferences.workspaceMode);
    }
  }, []);`;

const mountNew = `    if (savedViewPreferences?.workspaceMode) {
      setWorkspaceMode(savedViewPreferences.workspaceMode);
    }
    fetchAnnotations();
  }, []);`;

content = content.replace(mountOld, mountNew);

// 4. Add annotation handler functions after handleQuickSetStatus
const handlersOld = `  const handleQuickSetStatus = async (taskId: string, newStatus: TaskStatus) => {
    const ok = await updateTaskStatus(taskId, newStatus);
    if (ok && editingTask && editingTask.id === taskId) {
      setEditingTask({ ...editingTask, status: newStatus });
    }
  };`;

const handlersNew = `  const handleQuickSetStatus = async (taskId: string, newStatus: TaskStatus) => {
    const ok = await updateTaskStatus(taskId, newStatus);
    if (ok && editingTask && editingTask.id === taskId) {
      setEditingTask({ ...editingTask, status: newStatus });
    }
  };

  const fetchAnnotations = async () => {
    try {
      const res = await fetch('/api/annotations');
      if (res.ok) {
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          setAnnotations(result.data);
        }
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
    }
  };

  const handleSaveAnnotation = async () => {
    if (!selectedHighlight || !annotationComment.trim() || !editingTask) return;
    try {
      const res = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: editingTask.id,
          taskTitle: editingTask.title,
          selectedText: selectedHighlight.text,
          comment: annotationComment.trim(),
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setAnnotations(prev => [result.data, ...prev]);
          setIsAnnotationModalOpen(false);
          setSelectedHighlight(null);
          setAnnotationComment('');
          window.getSelection()?.removeAllRanges();
          setModalActiveTab('annotations');
        }
      }
    } catch (err) {
      console.error('Failed to save annotation:', err);
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      const res = await fetch(\`/api/annotations/\${id}\`, { method: 'DELETE' });
      if (res.ok) {
        setAnnotations(prev => prev.filter(a => a.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete annotation:', err);
    }
  };

  const handleCoursewareMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const text = selection.toString().trim();
    if (text.length > 0 && text.length < 3000) {
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectedHighlight({
          text,
          x: Math.max(80, Math.min(window.innerWidth - 80, rect.left + rect.width / 2)),
          y: Math.max(50, rect.top - 10),
        });
      } catch (e) {
        console.error('Selection rect error:', e);
      }
    }
  };`;

content = content.replace(handlersOld, handlersNew);

// 5. Add Annotations tab in Navigation Tabs
const tabsOld = `              <button
                type="button"
                onClick={() => setModalActiveTab('gemini')}
                className={\`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 \${
                  modalActiveTab === 'gemini'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }\`}
              >
                <span>🤖</span>
                <span>向 Gemini 发起求教与考核</span>
              </button>
            </div>`;

const tabsNew = `              <button
                type="button"
                onClick={() => setModalActiveTab('gemini')}
                className={\`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 \${
                  modalActiveTab === 'gemini'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }\`}
              >
                <span>🤖</span>
                <span>向 Gemini 发起求教与考核</span>
              </button>
              <button
                type="button"
                onClick={() => setModalActiveTab('annotations')}
                className={\`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 \${
                  modalActiveTab === 'annotations'
                    ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }\`}
              >
                <span>📌</span>
                <span>我的批注与疑问 ({annotations.filter(a => a.taskId === editingTask.id).length})</span>
              </button>
            </div>`;

content = content.replace(tabsOld, tabsNew);

// 6. Update courseware-content and add floating button
const coursewareOld = `              {modalActiveTab === 'courseware' && (
                <div
                  className="courseware-content max-w-none text-slate-800 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: marked.parse(editingTask.description || '*暂无讲义内容*') }}
                />
              )}`;

const coursewareNew = `              {modalActiveTab === 'courseware' && (
                <div className="relative">
                  {selectedHighlight && !isAnnotationModalOpen && (
                    <div
                      style={{
                        position: 'fixed',
                        left: \`\${selectedHighlight.x}px\`,
                        top: \`\${selectedHighlight.y}px\`,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 9999,
                      }}
                      className="animate-bounce pointer-events-auto"
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsAnnotationModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 text-amber-300 hover:text-white hover:bg-amber-600 rounded-full text-xs font-black shadow-2xl border border-amber-400/40 transition-all cursor-pointer active:scale-95"
                      >
                        <span>💬</span>
                        <span>划词批注 / 提问</span>
                      </button>
                    </div>
                  )}

                  <div
                    onMouseUp={handleCoursewareMouseUp}
                    className="courseware-content max-w-none text-slate-800 leading-relaxed select-text cursor-text"
                    dangerouslySetInnerHTML={{ __html: marked.parse(editingTask.description || '*暂无讲义内容*') }}
                  />
                </div>
              )}`;

content = content.replace(coursewareOld, coursewareNew);

// 7. Add annotations view tab content before modalActiveTab === 'notes'
const notesOld = `              {modalActiveTab === 'notes' && (`;

const annotationsViewCode = `              {modalActiveTab === 'annotations' && (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-black text-amber-900 flex items-center gap-2">
                        <span>📌</span>
                        <span>本模块划词批注与待答疑问</span>
                      </h3>
                      <p className="text-xs text-amber-700 mt-1">
                        你在讲义中划选打上的所有批注已自动实时同步给本地文件。下次在 Antigravity 中只要发话呼叫 Gemini，即可获取逐句攻坚解答！
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const moduleAnnotations = annotations.filter(a => a.taskId === editingTask.id);
                        if (moduleAnnotations.length === 0) {
                          alert('当前模块暂无批注');
                          return;
                        }
                        const prompt = \`Gemini老师，我在【\${editingTask.title}】的讲义中做了以下几条批注和提问，请帮我逐条攻坚解答：\\n\\n\` +
                          moduleAnnotations.map((a, i) => \`\${i + 1}. 原文引用：【\${a.selectedText}】\\n   我的疑问：\${a.comment}\`).join('\\n\\n');
                        navigator.clipboard.writeText(prompt);
                        alert('已成功将全部批注提问复制到剪贴板！可以直接在聊天框粘贴发送给 Gemini！');
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1 flex-shrink-0"
                    >
                      <span>📋</span>
                      <span>一键复制所有批注提问</span>
                    </button>
                  </div>

                  {annotations.filter(a => a.taskId === editingTask.id).length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <div className="text-4xl mb-2">💡</div>
                      <p className="text-sm font-medium">当前模块暂无批注</p>
                      <p className="text-xs text-slate-400 mt-1">回到「课程全解讲义」选项卡，用鼠标划选任何不懂的句子即可随时弹出批注提问！</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {annotations.filter(a => a.taskId === editingTask.id).map((ann, idx) => (
                        <div key={ann.id} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-amber-300 transition-all shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-black text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                              批注疑问 #{idx + 1}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-400">{ann.createdAt}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteAnnotation(ann.id)}
                                className="text-xs text-slate-400 hover:text-red-500 font-bold px-2 py-0.5 rounded hover:bg-red-50"
                                title="删除此条批注"
                              >
                                ✕ 删除
                              </button>
                            </div>
                          </div>
                          <div className="p-3 bg-slate-50 border-l-4 border-amber-400 rounded-r-lg mb-2.5 text-xs font-mono text-slate-700 select-all leading-relaxed">
                            “{ann.selectedText}”
                          </div>
                          <div className="text-sm font-bold text-slate-900 flex items-start gap-2">
                            <span className="text-amber-500 flex-shrink-0">❓</span>
                            <span>{ann.comment}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {modalActiveTab === 'notes' && (`;

content = content.replace(notesOld, annotationsViewCode);

// 8. Add isAnnotationModalOpen mini dialog after the task modal
const modalEndOld = `              </div>
            </div>
          </div>
        </div>
      )}

      {isCreateTaskModalOpen && (`;

const miniDialogCode = `              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mini Dialog for Creating Annotation */}
      {isAnnotationModalOpen && selectedHighlight && editingTask && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10000] p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slideUp border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span className="text-amber-500">💬</span>
                <span>为划选文字添加批注 / 提问</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAnnotationModalOpen(false);
                  setSelectedHighlight(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-500 mb-1">已划选原文引用：</label>
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs font-mono text-slate-800 max-h-32 overflow-y-auto leading-relaxed">
                “{selectedHighlight.text}”
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                你的疑问或批注内容：
              </label>
              <textarea
                value={annotationComment}
                onChange={(e) => setAnnotationComment(e.target.value)}
                placeholder="例如：为什么这里是覆盖 8 字节而不是 4 字节？请用通俗的语言解释底层原因..."
                rows={4}
                autoFocus
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsAnnotationModalOpen(false);
                  setSelectedHighlight(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveAnnotation}
                disabled={!annotationComment.trim()}
                className="px-5 py-2 text-xs font-black text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-amber-500/20 active:scale-95 flex items-center gap-1.5"
              >
                <span>💾</span>
                <span>保存并同步批注</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateTaskModalOpen && (`;

content = content.replace(modalEndOld, miniDialogCode);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Successfully patched App.tsx with Annotation System!');
