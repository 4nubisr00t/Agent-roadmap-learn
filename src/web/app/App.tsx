import React, { useState, useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import { getItem, setItem, STORAGE_KEYS } from './utils/storage.js';
import TagBadge from './components/TagBadge.js';
import TagFilter from './components/TagFilter.js';
import TagSelector from './components/TagSelector.js';
import DependencyViewsPanel from './components/DependencyViewsPanel.js';
import TagManagerModal from './components/modals/TagManagerModal.js';

interface Project {
  id: string;
  name: string;
  description?: string;
  projectType: string;
  status: string;
  updatedAt: string;
}

interface ProjectSummary {
  project: Project;
  taskCount: number;
  milestoneCount: number;
  dependencyViewCount?: number;
}

interface GraphSummary {
  id: string;
  name: string;
  description: string;
  dimension: string | null;
  revision: number;
  nodeCount?: number;
}

interface AppMeta {
  version: string;
  repositoryUrl: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  description?: string;
  dueDate?: string;
  assignee?: string;
  tags: string[];
}

interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt?: string;
  taskCount?: number;
}

type CardMode = 'compact' | 'detailed';
type StatusFilter = 'all' | 'active' | 'completed';
type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done';
type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
type WorkspaceMode = 'kanban' | 'dependency';

interface CreateTaskInput {
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  tags: string[];
}

function normalizeStatus(status: string): TaskStatus {
  const normalized = status.replace('_', '-');
  if (normalized === 'todo' || normalized === 'in-progress' || normalized === 'review' || normalized === 'done') {
    return normalized;
  }
  return 'todo';
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  todo: { label: 'TODO', color: 'text-slate-600', bgColor: 'bg-slate-100' },
  'in-progress': { label: 'In Progress', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  review: { label: 'Review', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  done: { label: 'Done', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Critical', color: 'text-rose-700', bgColor: 'bg-rose-100' },
  high: { label: 'High', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  medium: { label: 'Medium', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  low: { label: 'Low', color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
};

const KANBAN_COLUMNS: TaskStatus[] = ['todo', 'in-progress', 'review', 'done'];

export interface AnnotationItem {
  id: string;
  taskId: string;
  taskTitle: string;
  selectedText: string;
  comment: string;
  createdAt: string;
  status?: string;
}

const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [tasks, setTasks] = useState<{ task: Task; project: Project }[]>([]);
  const [cardMode, setCardMode] = useState<CardMode>('compact');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('dependency');
  const [graphViews, setGraphViews] = useState<GraphSummary[]>([]);
  const [graphPickerTaskId, setGraphPickerTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState<'courseware' | 'notes' | 'gemini' | 'annotations'>('courseware');
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [selectedHighlight, setSelectedHighlight] = useState<{ text: string; x: number; y: number } | null>(null);
  const [isAnnotationModalOpen, setIsAnnotationModalOpen] = useState(false);
  const [annotationComment, setAnnotationComment] = useState('');
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [taskFormError, setTaskFormError] = useState('');
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'critical' | 'high' | 'medium' | 'low',
    dueDate: '',
    showDueDate: false,
    tags: [] as string[],
  });
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [createTaskStatus, setCreateTaskStatus] = useState<TaskStatus>('todo');
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    projectType: 'roadmap' as 'roadmap' | 'skill-tree' | 'kanban',
    startDate: new Date().toISOString().split('T')[0],
    targetDate: '',
  });
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(
    () => getItem<boolean>(STORAGE_KEYS.PROJECT_SIDEBAR_COLLAPSED) ?? false
  );
  const [appMeta, setAppMeta] = useState<AppMeta>({
    version: '',
    repositoryUrl: 'https://github.com/shiquda/roadmap-skill',
  });
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const tasksRequestIdRef = useRef(0);
  const tagsRequestIdRef = useRef(0);
  const graphViewsRequestIdRef = useRef(0);

  const resetNewTaskForm = () => {
    setNewTaskForm({
      title: '',
      description: '',
      priority: 'medium',
      dueDate: '',
      showDueDate: false,
      tags: [],
    });
  };

  // Load persisted state on mount
  useEffect(() => {
    const savedProjectId = getItem<string>(STORAGE_KEYS.SELECTED_PROJECT_ID);
    if (savedProjectId) {
      setSelectedProject(savedProjectId);
    }

    const savedViewPreferences = getItem<{ cardMode?: CardMode; workspaceMode?: WorkspaceMode }>(STORAGE_KEYS.VIEW_PREFERENCES);
    if (savedViewPreferences?.cardMode) {
      setCardMode(savedViewPreferences.cardMode);
    }
    if (savedViewPreferences?.workspaceMode) {
      setWorkspaceMode(savedViewPreferences.workspaceMode);
    }
    fetchAnnotations();
  }, []);

  // Persist selected project when it changes
  useEffect(() => {
    if (selectedProject !== null) {
      setItem(STORAGE_KEYS.SELECTED_PROJECT_ID, selectedProject);
    } else {
      // Clear storage when "All Projects" is selected
      setItem(STORAGE_KEYS.SELECTED_PROJECT_ID, null);
    }
  }, [selectedProject]);

  useEffect(() => {
    setGraphPickerTaskId(null);
    setIsEditModalOpen(false);
    setEditingTask(null);
  }, [selectedProject]);

  // Persist view preferences when they change (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setItem(STORAGE_KEYS.VIEW_PREFERENCES, { cardMode, workspaceMode });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [cardMode, workspaceMode]);

  useEffect(() => {
    setItem(STORAGE_KEYS.PROJECT_SIDEBAR_COLLAPSED, isProjectSidebarCollapsed);
  }, [isProjectSidebarCollapsed]);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        const list = (data as ProjectSummary[]) || [];
        setProjects(list);
        if (list.length > 0) {
          setSelectedProject((prev) => {
            if (prev && list.some(item => item.project?.id === prev)) {
              return prev;
            }
            return list[0].project?.id || null;
          });
        } else {
          setSelectedProject(null);
        }
      });
  }, []);

  useEffect(() => {
    fetch('/api/meta')
      .then(res => res.json())
      .then(data => {
        const meta = data as Partial<AppMeta>;
        if (meta.version && meta.version !== '0.0.0' && meta.repositoryUrl) {
          setAppMeta({ version: meta.version, repositoryUrl: meta.repositoryUrl });
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load app metadata', error);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedProject) {
      params.append('projectId', selectedProject);
    }
    if (workspaceMode === 'dependency' || statusFilter === 'all' || statusFilter === 'completed') {
      params.append('includeCompleted', 'true');
    }
    const queryString = params.toString();
    const url = `/api/tasks${queryString ? `?${queryString}` : ''}`;

    tasksRequestIdRef.current += 1;
    const requestId = tasksRequestIdRef.current;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (requestId !== tasksRequestIdRef.current) {
          return;
        }

        const normalized = (data as { task: Task; project: Project }[]).map((item) => ({
          ...item,
          task: {
            ...item.task,
            status: normalizeStatus(item.task.status),
            tags: item.task.tags || [],
          },
        }));
        setTasks(normalized);
      });
  }, [selectedProject, statusFilter, workspaceMode]);

  // Auto sync on focus and periodic interval to pick up Agent updates
  useEffect(() => {
    const handleSync = () => {
      const params = new URLSearchParams();
      if (selectedProject) {
        params.append('projectId', selectedProject);
      }
      params.append('includeCompleted', 'true');
      const url = `/api/tasks?${params.toString()}`;

      tasksRequestIdRef.current += 1;
      const requestId = tasksRequestIdRef.current;

      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (requestId !== tasksRequestIdRef.current) return;
          if (Array.isArray(data)) {
            const normalized = data.map((item) => ({
              ...item,
              task: {
                ...item.task,
                status: normalizeStatus(item.task.status),
                tags: item.task.tags || [],
              },
            }));
            setTasks(normalized);
          }
        })
        .catch(() => {});
    };

    window.addEventListener('focus', handleSync);
    const timer = setInterval(handleSync, 3000);
    return () => {
      window.removeEventListener('focus', handleSync);
      clearInterval(timer);
    };
  }, [selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      tagsRequestIdRef.current += 1;
      const requestId = tagsRequestIdRef.current;

      fetch(`/api/projects/${selectedProject}/tags`)
        .then(res => res.json())
        .then(data => {
          if (requestId !== tagsRequestIdRef.current) {
            return;
          }

          if (data.success) {
            setTags(data.data as Tag[]);
          }
        });
    } else {
      tagsRequestIdRef.current += 1;
      setTags([]);
      setSelectedTagIds([]);
    }
  }, [selectedProject]);

  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };

    window.addEventListener('keydown', handleGlobalSearchShortcut);
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut);
  }, []);

  const tagsWithTaskCounts = useMemo(() => {
    if (!selectedProject) {
      return tags;
    }

    const taskTagCounts = new Map<string, number>();
    tasks
      .filter(({ project }) => project.id === selectedProject)
      .forEach(({ task }) => {
        (task.tags || []).forEach((id) => {
          taskTagCounts.set(id, (taskTagCounts.get(id) ?? 0) + 1);
        });
      });

    return tags.map((tag) => ({
      ...tag,
      taskCount: taskTagCounts.get(tag.id) ?? 0,
    }));
  }, [selectedProject, tags, tasks]);

  useEffect(() => {
    if (!selectedProject) {
      graphViewsRequestIdRef.current += 1;
      setGraphViews([]);
      setGraphPickerTaskId(null);
      return;
    }

    graphViewsRequestIdRef.current += 1;
    const requestId = graphViewsRequestIdRef.current;

    fetch(`/api/projects/${selectedProject}/dependency-views`)
      .then((res) => res.json())
      .then((payload) => {
        if (requestId !== graphViewsRequestIdRef.current) {
          return;
        }

        if (payload.success) {
          setGraphViews(payload.data as GraphSummary[]);
        }
      });
  }, [selectedProject]);

  const filteredTasks = tasks.filter(({ task }) => {
    if (statusFilter === 'completed') {
      if (normalizeStatus(task.status) !== 'done') return false;
    }
    if (statusFilter === 'active') {
      if (normalizeStatus(task.status) === 'done') return false;
    }
    if (selectedTagIds.length > 0) {
      if (!task.tags || !selectedTagIds.every(id => task.tags.includes(id))) {
        return false;
      }
    }
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(keyword);
      const matchDescription = task.description?.toLowerCase().includes(keyword) ?? false;
      if (!matchTitle && !matchDescription) return false;
    }
    return true;
  });

  const handleTagsChange = (newTags: Tag[]) => {
    setTags(newTags);
    const tagIds = new Set(newTags.map(t => t.id));
    setTasks(prev => prev.map(item => ({
      ...item,
      task: {
        ...item.task,
        tags: (item.task.tags || []).filter(id => tagIds.has(id))
      }
    })));
  };

  const handleAddTaskToGraph = async (taskId: string, projectId: string, graphId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/projects/${projectId}/dependency-views/${graphId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to add task to graph');
      }

      setGraphPickerTaskId(null);
      if (selectedProject === projectId) {
        const viewsResponse = await fetch(`/api/projects/${projectId}/dependency-views`);
        const viewsPayload = await viewsResponse.json();
        if (viewsPayload.success) {
          setGraphViews(viewsPayload.data as GraphSummary[]);
        }
      }
    } catch (error) {
      console.error('Failed to add task to graph:', error);
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsEditModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!editingTask) return;

    try {
      const response = await fetch(`/api/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: tasks.find(t => t.task.id === editingTask.id)?.project.id,
          taskId: editingTask.id,
          title: editingTask.title,
          description: editingTask.description,
          status: normalizeStatus(editingTask.status),
          priority: editingTask.priority,
          tags: editingTask.tags,
          dueDate: editingTask.dueDate,
        }),
      });

      if (response.ok) {
        setTasks(prev => prev.map(t => 
          t.task.id === editingTask.id
            ? { ...t, task: { ...editingTask, status: normalizeStatus(editingTask.status) } }
            : t
        ));
        setIsEditModalOpen(false);
        setEditingTask(null);
      }
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const handleExportSingleNote = (task: Task) => {
    const safeTitle = task.title.replace(/[\\/:*?"<>|]/g, '_');
    const md = `# ${task.title}\n\n> 状态: ${task.status} | 优先级: ${task.priority}\n\n${task.description || ''}`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQuickSetStatus = async (taskId: string, newStatus: TaskStatus) => {
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
      const res = await fetch(`/api/annotations/${id}`, { method: 'DELETE' });
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
  };

  const handleDeleteTask = async (taskId: string, projectId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const response = await fetch(`/api/tasks?projectId=${projectId}&taskId=${taskId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTasks(prev => prev.filter(t => t.task.id !== taskId));
        setProjects(prev => prev.map(p => 
          p.project.id === projectId 
            ? { ...p, taskCount: p.taskCount - 1 }
            : p
        ));
      }
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project? All tasks will be deleted.')) return;

    try {
      const response = await fetch(`/api/projects?projectId=${projectId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setProjects(prev => prev.filter(p => p.project.id !== projectId));
        if (selectedProject === projectId) {
          setSelectedProject(null);
        }
        setTasks(prev => prev.filter(t => t.project.id !== projectId));
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/backup');
      if (!response.ok) {
        throw new Error('Export failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `roadmap-skill-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error('Import failed');
      }
      
      const result = await response.json();
      if (result.success) {
        setImportStatus({ type: 'success', message: `Successfully imported ${result.imported} projects` });
        window.location.reload();
      } else {
        setImportStatus({ type: 'error', message: `Import completed with ${result.errors} errors` });
      }
    } catch (error) {
      setImportStatus({ type: 'error', message: 'Import failed: ' + (error instanceof Error ? error.message : 'Invalid file') });
    }
  };

  const handleDragOverFile = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDraggingFile(true);
    }
  };

  const handleDragLeaveFile = (e: React.DragEvent) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDraggingFile(false);
  };

  const handleDropFile = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        await handleImport(file);
      } else {
        setImportStatus({ type: 'error', message: 'Please drop a JSON backup file' });
      }
    }
  };

  const handleCreateProject = async () => {
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const createdProject = result.data.project || result.data;
          const newId = createdProject.id;

          const listRes = await fetch('/api/projects');
          const listData = await listRes.json();
          if (Array.isArray(listData)) {
            setProjects(listData);
          } else {
            setProjects(prev => [{
              project: createdProject,
              taskCount: 0,
              milestoneCount: 0
            }, ...prev]);
          }

          setSelectedProject(newId);
          setWorkspaceMode('dependency');
          setIsCreateProjectOpen(false);
          setNewProject({
            name: '',
            description: '',
            projectType: 'skill-tree',
            startDate: new Date().toISOString().split('T')[0],
            targetDate: '',
          });
        }
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const createTaskForProject = async ({
    projectId,
    title,
    description,
    status,
    priority,
    dueDate,
    tags,
  }: CreateTaskInput): Promise<Task | null> => {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        title,
        description,
        status: normalizeStatus(status),
        priority,
        dueDate,
        tags,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create task.');
    }

    const result = await response.json() as { success?: boolean; data?: Task };
    if (!result.success || !result.data) {
      throw new Error('Failed to create task.');
    }

    const normalizedTask: Task = {
      ...result.data,
      status: normalizeStatus(result.data.status),
      tags: result.data.tags || [],
    };
    const project = projects.find((item) => item.project.id === projectId)?.project;

    if (!project) {
      throw new Error('Project not found for the new task.');
    }

    setTasks((prev) => [...prev, { task: normalizedTask, project }]);
    setProjects((prev) => prev.map((item) =>
      item.project.id === projectId
        ? { ...item, taskCount: item.taskCount + 1 }
        : item
    ));

    return normalizedTask;
  };

  const updateTaskStatus = async (taskId: string, newStatus: TaskStatus): Promise<boolean> => {
    const taskItem = tasks.find((item) => item.task.id === taskId);
    const normalizedStatus = normalizeStatus(newStatus);
    if (!taskItem || normalizeStatus(taskItem.task.status) === normalizedStatus) {
      return true;
    }

    try {
      const response = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: taskItem.project.id,
          taskId,
          status: normalizedStatus,
        }),
      });

      if (!response.ok) {
        return false;
      }

      setTasks((prev) => prev.map((item) =>
        item.task.id === taskId
          ? { ...item, task: { ...item.task, status: normalizedStatus } }
          : item
      ));
      return true;
    } catch (error) {
      console.error('Failed to update task status:', error);
      return false;
    }
  };

  const handleCreateTask = async () => {
    const title = newTaskForm.title.trim();
    if (!title) {
      setTaskFormError('Title is required.');
      return;
    }
    if (title.length < 3) {
      setTaskFormError('Title must be at least 3 characters.');
      return;
    }
    if (title.length > 120) {
      setTaskFormError('Title must be 120 characters or fewer.');
      return;
    }

    const targetProjectId = selectedProject;
    if (!targetProjectId) {
      setTaskFormError('Please select a project from the left sidebar before adding a task.');
      return;
    }

    try {
      await createTaskForProject({
        projectId: targetProjectId,
        title,
        description: newTaskForm.description,
        status: createTaskStatus,
        priority: newTaskForm.priority,
        dueDate: newTaskForm.dueDate || undefined,
        tags: newTaskForm.tags,
      });
      resetNewTaskForm();
      setTaskFormError('');
      setIsCreateTaskModalOpen(false);
    } catch (error) {
      console.error('Failed to create task:', error);
      setTaskFormError('Failed to create task. Please try again.');
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId);
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, column: string) => {
    e.preventDefault();
    setDragOverColumn(column);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    
    if (!draggedTask) return;

    const taskItem = tasks.find(t => t.task.id === draggedTask);
    if (!taskItem || normalizeStatus(taskItem.task.status) === normalizeStatus(newStatus)) {
      setDraggedTask(null);
      return;
    }

    await updateTaskStatus(draggedTask, normalizeStatus(newStatus));
    setDraggedTask(null);
  };

  const handleCreateTaskFromGraph = async (projectId: string, input: {
    title: string;
    description: string;
    priority: TaskPriority;
    tags: string[];
  }): Promise<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    description?: string;
    tags: string[];
  } | null> => {
    if (!projectId) {
      return null;
    }

    try {
      const createdTask = await createTaskForProject({
        projectId,
        title: input.title,
        description: input.description,
        status: 'todo',
        priority: input.priority,
        tags: input.tags,
      });

      if (!createdTask) {
        return null;
      }

      return {
        id: createdTask.id,
        title: createdTask.title,
        status: normalizeStatus(createdTask.status),
        priority: createdTask.priority as TaskPriority,
        description: createdTask.description,
        tags: createdTask.tags || [],
      };
    } catch (error) {
      console.error('Failed to create graph task:', error);
      return null;
    }
  };

  const getTasksByStatus = (status: TaskStatus) => 
    filteredTasks
      .filter(({ task }) => normalizeStatus(task.status) === status)
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.task.priority as keyof typeof priorityOrder] - priorityOrder[b.task.priority as keyof typeof priorityOrder];
      });

  const renderTaskCard = ({ task, project }: { task: Task; project: Project }) => {
    const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    const isDragging = draggedTask === task.id;

    return (
      <div
        key={task.id}
        draggable
        onDragStart={(e) => handleDragStart(e, task.id)}
        onDragEnd={() => setDraggedTask(null)}
        className={`bg-white rounded-2xl border border-slate-100/50 cursor-move transition-all duration-300 ease-out group flex flex-col ${
          isDragging
            ? 'shadow-2xl scale-105 border-emerald-400 rotate-1 z-10'
            : 'shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-emerald-100'
        } ${
          cardMode === 'compact' ? 'p-3' : 'p-5'
        }`}
      >
        <div className={`flex justify-between items-start mb-1`}>
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${priority.bgColor} ${priority.color} border border-current opacity-80`}>
            {priority.label}
          </span>
          <div className={`relative flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all ${cardMode === 'compact' ? 'scale-90' : ''}`}>
            {selectedProject === project.id && graphViews.length > 0 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setGraphPickerTaskId((current) => current === task.id ? null : task.id);
                  }}
                  className={`text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all font-black ${cardMode === 'compact' ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]'}`}
                  title="Add to Graph"
                >
                  Graph
                </button>
                {graphPickerTaskId === task.id && (
                  <div className="absolute right-0 top-9 z-20 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Add To Graph</div>
                    <div className="mt-1 space-y-1">
                      {graphViews.map((graph) => (
                        <button
                          key={graph.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleAddTaskToGraph(task.id, project.id, graph.id);
                          }}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-emerald-50"
                        >
                          <span className="truncate pr-2">{graph.name}</span>
                          <span className="text-[10px] text-slate-400">r{graph.revision}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditTask(task);
              }}
              className={`text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded transition-all ${cardMode === 'compact' ? 'p-1' : 'p-1.5'}`}
              title="Edit"
            >
              <svg className={cardMode === 'compact' ? 'w-3 h-3' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteTask(task.id, project.id);
              }}
              className={`text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-all ${cardMode === 'compact' ? 'p-1' : 'p-1.5'}`}
              title="Delete"
            >
              <svg className={cardMode === 'compact' ? 'w-3 h-3' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>
        <h3
          onClick={() => handleEditTask(task)}
          className={`text-slate-800 font-bold cursor-pointer leading-tight hover:text-emerald-500 transition-colors line-clamp-2 ${cardMode === 'compact' ? 'text-sm' : 'text-base'}`}
        >
          {task.title}
        </h3>
        
        {cardMode === 'detailed' && task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 mb-0.5">
            {task.tags.map(tagId => {
              const tag = tags.find(t => t.id === tagId);
              return tag ? (
                <TagBadge
                  key={tagId}
                  name={tag.name}
                  color={tag.color}
                  size="sm"
                  className="rounded-lg font-bold"
                />
              ) : null;
            })}
          </div>
        )}

        <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-50">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter truncate max-w-[100px]">{project.name}</span>
          {task.dueDate && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
              <span>📅</span>
              <span>{new Date(task.dueDate).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span>
            </div>
          )}
        </div>

        {cardMode === 'detailed' && task.description && (
          <p className="text-xs text-slate-500 line-clamp-2 mt-3 leading-relaxed bg-slate-50/50 p-2 rounded-lg border border-slate-100/50">
            {task.description}
          </p>
        )}
      </div>
    );
  };

  const doneTasksCount = tasks.filter(t => normalizeStatus(t.task.status) === 'done').length;
  const inProgressCount = tasks.filter(t => normalizeStatus(t.task.status) === 'in-progress').length;
  const totalTasksCount = tasks.length;
  const progressPercent = totalTasksCount > 0 ? Math.round((doneTasksCount / totalTasksCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-blue-50/20 p-6">
      <header className="mb-6 flex flex-wrap justify-between items-center gap-4 bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white text-xl shadow-md shadow-emerald-500/20 font-black">
            ⚡
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              Agent<span className="text-emerald-500">Learn</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                模块化技能进阶
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">Antigravity × Gemini 导师协同系统</p>
          </div>
        </div>

        {totalTasksCount > 0 && (
          <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200/60">
            <div className="text-right">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">技能补齐进度</div>
              <div className="text-sm font-black text-slate-800">
                {doneTasksCount} / {totalTasksCount} 模块 <span className="text-emerald-600 font-bold">({progressPercent}%)</span>
              </div>
            </div>
            <div className="w-28 h-3 bg-slate-200 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700 shadow-sm"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-200/60 rounded-xl p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setWorkspaceMode('dependency')}
              disabled={!selectedProject}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                workspaceMode === 'dependency'
                  ? 'bg-white text-emerald-800 shadow-sm font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <span>🕸️</span>
              <span>技能拓扑图 (Graph)</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode('kanban')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                workspaceMode === 'kanban'
                  ? 'bg-white text-emerald-800 shadow-sm font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📋</span>
              <span>模块看板 (Kanban)</span>
            </button>
          </div>

          <div className="flex bg-slate-200/50 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setCardMode('compact')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                cardMode === 'compact'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              紧凑
            </button>
            <button
              type="button"
              onClick={() => setCardMode('detailed')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                cardMode === 'detailed'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              详细
            </button>
          </div>
          {tags.length > 0 && (
            <>
              <div className="h-5 w-px bg-slate-300" />
               <TagFilter
                 tags={tagsWithTaskCounts}
                 selectedTags={selectedTagIds}
                 onChange={setSelectedTagIds}
               />
            </>
          )}
          <div className="h-5 w-px bg-slate-300" />
          <div className="flex bg-slate-200/50 rounded-xl p-1">
            {(['all', 'active', 'completed'] as StatusFilter[]).map(f => (
                <button
                  type="button"
                  key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all capitalize ${
                  statusFilter === f
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="h-5 w-px bg-slate-300" />
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1.5 text-sm bg-white/50 border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all w-40 shadow-inner"
            />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-col gap-6 lg:h-[calc(100vh-10.5rem)] lg:flex-row">
        <aside
          className={`flex min-h-0 flex-shrink-0 flex-col rounded-[28px] border border-white/60 bg-white/35 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 lg:h-full ${
            isProjectSidebarCollapsed ? 'lg:w-24' : 'lg:w-60'
          }`}
        >
          <div className="flex justify-between items-center mb-6 gap-2">
            {!isProjectSidebarCollapsed && <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Projects</h2>}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setIsProjectSidebarCollapsed((value) => !value)}
                className="w-8 h-8 flex items-center justify-center rounded-full border border-white/70 bg-white text-slate-500 hover:text-slate-800 hover:shadow-sm transition-all"
                title={isProjectSidebarCollapsed ? 'Expand project list' : 'Collapse project list'}
              >
                {isProjectSidebarCollapsed ? '→' : '←'}
              </button>
              <button
                onClick={() => setIsCreateProjectOpen(true)}
                className="w-8 h-8 flex items-center justify-center bg-emerald-500 text-white rounded-full hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/20 active:scale-95"
                title="New Project"
              >
                <span className="text-lg">+</span>
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setSelectedProject(null)}
                className={`w-full rounded-xl transition-all duration-300 ${!selectedProject ? 'bg-white shadow-md ring-1 ring-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:bg-white/50 hover:text-slate-800'} ${
                  isProjectSidebarCollapsed ? 'px-2 py-3 text-center' : 'text-left px-4 py-3'
                }`}
                title={isProjectSidebarCollapsed ? 'All Projects' : undefined}
              >
                <div className={`flex items-center ${isProjectSidebarCollapsed ? 'flex-col gap-1 justify-center' : 'justify-between'}`}>
                  <span className={`${isProjectSidebarCollapsed ? 'text-[11px] uppercase tracking-widest' : ''}`}>All Projects</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${!selectedProject ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {projects.reduce((sum, p) => sum + p.taskCount, 0)}
                  </span>
                </div>
              </button>
              {projects.map(p => {
                const projectObj = (p.project as any)?.project || p.project;
                const pId = projectObj?.id;
                const pName = projectObj?.name || '未命名技能树';
                if (!pId) return null;
                return (
                  <div key={pId} className="group relative">
                    <button
                      type="button"
                      onClick={() => setSelectedProject(pId)}
                      className={`w-full rounded-xl transition-all duration-300 ${selectedProject === pId ? 'bg-white shadow-md ring-1 ring-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:bg-white/50 hover:text-slate-800'} ${
                        isProjectSidebarCollapsed ? 'px-2 py-3 text-center' : 'text-left px-4 py-3'
                      }`}
                      title={isProjectSidebarCollapsed ? pName : undefined}
                    >
                      <div className={`flex items-center ${isProjectSidebarCollapsed ? 'flex-col gap-1 justify-center' : 'justify-between'}`}>
                        <span className={`${isProjectSidebarCollapsed ? 'text-[11px] font-black uppercase tracking-widest' : 'truncate pr-6'}`}>
                          {isProjectSidebarCollapsed ? pName.slice(0, 2) : pName}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${selectedProject === pId ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {p.taskCount || 0}
                        </span>
                      </div>
                    </button>
                    {!isProjectSidebarCollapsed && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(pId);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete Project"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-6 border-t border-slate-200/50 pt-6 space-y-3">
            <button
              type="button"
              onClick={() => setIsTagManagerOpen(true)}
              disabled={!selectedProject}
              className={`w-full flex items-center text-sm font-semibold text-slate-600 hover:bg-white/50 rounded-xl transition-all group disabled:opacity-40 disabled:cursor-not-allowed ${
                isProjectSidebarCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3'
              }`}
              title={isProjectSidebarCollapsed ? 'Manage Tags' : undefined}
            >
              <span className="text-lg group-hover:scale-125 transition-transform">🏷️</span>
              {!isProjectSidebarCollapsed && <span>Manage Tags</span>}
            </button>
            <button
              type="button"
              onClick={handleExport}
              className={`w-full flex items-center text-sm font-semibold text-slate-600 hover:bg-white/50 rounded-xl transition-all ${
                isProjectSidebarCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3'
              }`}
              title="Export all data as JSON"
            >
              <span className="text-lg">📥</span>
              {!isProjectSidebarCollapsed && <span>Export Data</span>}
            </button>
            <label
              className={`w-full flex items-center text-sm font-semibold text-slate-600 hover:bg-white/50 rounded-xl transition-all cursor-pointer ${
                isProjectSidebarCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3'
              }`}
              title={isProjectSidebarCollapsed ? 'Import Data' : undefined}
            >
              <span className="text-lg">📤</span>
              {!isProjectSidebarCollapsed && <span>Import Data</span>}
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImport(file);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
            <a
              href={appMeta.repositoryUrl}
              target="_blank"
              rel="noreferrer"
              className={`w-full flex items-center text-sm font-semibold text-slate-500 hover:bg-white/50 rounded-xl transition-all ${
                isProjectSidebarCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3'
              }`}
              title={isProjectSidebarCollapsed ? `GitHub · v${appMeta.version}` : 'Open GitHub repository'}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 fill-current text-slate-500">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.92.57.1.78-.25.78-.56 0-.27-.01-1.17-.02-2.13-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.75.4-1.25.72-1.54-2.56-.29-5.26-1.28-5.26-5.69 0-1.26.45-2.3 1.18-3.11-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.19A10.9 10.9 0 0 1 12 6.03c.97 0 1.95.13 2.87.38 2.18-1.5 3.14-1.19 3.14-1.19.63 1.58.24 2.75.12 3.04.74.81 1.18 1.85 1.18 3.11 0 4.42-2.71 5.39-5.29 5.67.41.36.78 1.08.78 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.2.67.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              {!isProjectSidebarCollapsed && (
                <span className="flex min-w-0 items-center justify-between gap-3 w-full">
                  <span className="truncate">GitHub</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    v{appMeta.version}
                  </span>
                </span>
              )}
            </a>
          </div>
        </aside>

        <main
          className={`relative flex-1 min-h-0 lg:h-full ${isDraggingFile ? 'ring-2 ring-blue-400 ring-dashed bg-blue-50/30' : ''}`}
          onDragOver={handleDragOverFile}
          onDragLeave={handleDragLeaveFile}
          onDrop={handleDropFile}
        >
          {isDraggingFile && (
            <div className="absolute inset-0 bg-blue-100/80 flex items-center justify-center z-50 rounded-xl">
              <div className="text-center">
                <div className="text-4xl mb-2">📁</div>
                <p className="text-lg font-medium text-blue-900">Drop backup file here</p>
                <p className="text-sm text-blue-600">JSON files only</p>
              </div>
            </div>
          )}
          {importStatus && (
            <div
              className={`absolute top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 transition-all ${
                importStatus.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {importStatus.message}
              <button
                onClick={() => setImportStatus(null)}
                className="ml-3 text-sm font-medium hover:opacity-70"
              >
                ×
              </button>
            </div>
          )}
          {workspaceMode === 'kanban' ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="mb-4 text-xs font-bold text-slate-400">
                {filteredTasks.length} {filteredTasks.length === 1 ? 'Task' : 'Tasks'}
              </div>

              <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {KANBAN_COLUMNS.map(column => {
                  const columnTasks = getTasksByStatus(column);
                  const statusConfig = STATUS_CONFIG[column];
                  const isDragOver = dragOverColumn === column;
                  return (
                    <div
                      key={column}
                      className={`flex min-h-[420px] flex-col rounded-2xl p-4 transition-all duration-300 lg:h-full lg:min-h-0 ${
                        isDragOver 
                          ? 'bg-emerald-100/50 ring-2 ring-emerald-400 shadow-lg scale-[1.02]' 
                          : 'bg-white/30 backdrop-blur-[2px] border border-white/50 shadow-sm'
                      }`}
                      onDragOver={(e) => handleDragOver(e, column)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, column)}
                    >
                      <div className="flex items-center justify-between mb-6 px-1">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-6 rounded-full ${statusConfig.bgColor.replace('bg-', 'bg-')}`} style={{backgroundColor: statusConfig.color.includes('blue') ? '#3B82F6' : statusConfig.color.includes('amber') ? '#F59E0B' : statusConfig.color.includes('emerald') ? '#10B981' : '#64748B'}}></div>
                          <h3 className="font-bold text-slate-800 tracking-tight">{statusConfig.label}</h3>
                          <span className="text-[10px] font-bold bg-white/60 text-slate-500 px-2 py-0.5 rounded-full shadow-sm">
                            {columnTasks.length}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setCreateTaskStatus(column);
                            setTaskFormError('');
                            setNewTaskForm({ title: '', description: '', priority: 'medium', dueDate: '', showDueDate: false, tags: [] });
                            setIsCreateTaskModalOpen(true);
                          }}
                          className="w-8 h-8 flex items-center justify-center text-emerald-500 hover:text-emerald-600 hover:bg-white rounded-xl transition-all shadow-sm hover:shadow-md active:scale-90"
                        >
                          <span className="text-xl font-bold">+</span>
                        </button>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2 transition-all duration-300">
                        {columnTasks.map((taskItem, index) => (
                          <div
                            key={taskItem.task.id}
                            className="animate-fadeIn"
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            {renderTaskCard(taskItem)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <DependencyViewsPanel
              projectId={selectedProject}
              projectName={projects.find(project => project.project.id === selectedProject)?.project.name}
              onGraphsChange={setGraphViews}
              onTaskStatusChange={updateTaskStatus}
              onCreateTask={handleCreateTaskFromGraph}
              onSelectTask={(taskId) => {
                const item = tasks.find(t => t.task.id === taskId);
                if (item) {
                  setModalActiveTab('courseware');
                  handleEditTask(item.task);
                }
              }}
              displayMode={cardMode}
              tags={tagsWithTaskCounts.map((tag) => ({
                id: tag.id,
                name: tag.name,
                color: tag.color,
              }))}
              tasks={tasks
                .filter(item => !selectedProject || item.project.id === selectedProject)
                .map(item => ({
                  id: item.task.id,
                  title: item.task.title,
                  status: normalizeStatus(item.task.status),
                  priority: item.task.priority as 'low' | 'medium' | 'high' | 'critical',
                  description: item.task.description,
                  tags: item.task.tags || [],
                }))}
            />
          )}
        </main>
      </div>

      {isEditModalOpen && editingTask && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsEditModalOpen(false);
              setEditingTask(null);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-slideUp border border-slate-100">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/70">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {STATUS_CONFIG[editingTask.status]?.label || editingTask.status}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">
                    {PRIORITY_CONFIG[editingTask.priority]?.label || editingTask.priority}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">
                  {editingTask.title}
                </h2>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleExportSingleNote(editingTask)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                  title="导出本节讲义与笔记为 Markdown 文件"
                >
                  <span>📥</span>
                  <span>导出笔记 (.md)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingTask(null);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-200/60 text-slate-500 hover:text-slate-800 hover:bg-slate-200 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-slate-100 bg-white">
              <button
                type="button"
                onClick={() => setModalActiveTab('courseware')}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                  modalActiveTab === 'courseware'
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>📖</span>
                <span>课程全解讲义</span>
              </button>
              <button
                type="button"
                onClick={() => setModalActiveTab('notes')}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                  modalActiveTab === 'notes'
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>✏️</span>
                <span>自定义笔记与修改</span>
              </button>
              <button
                type="button"
                onClick={() => setModalActiveTab('gemini')}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                  modalActiveTab === 'gemini'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>🤖</span>
                <span>向 Gemini 发起求教与考核</span>
              </button>
              <button
                type="button"
                onClick={() => setModalActiveTab('annotations')}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                  modalActiveTab === 'annotations'
                    ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>📌</span>
                <span>我的批注与疑问 ({annotations.filter(a => a.taskId === editingTask.id).length})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 min-h-0 bg-white">
              {modalActiveTab === 'courseware' && (
                <div className="relative">
                  {selectedHighlight && !isAnnotationModalOpen && (
                    <div
                      style={{
                        position: 'fixed',
                        left: `${selectedHighlight.x}px`,
                        top: `${selectedHighlight.y}px`,
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
              )}

              {modalActiveTab === 'annotations' && (
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
                        const prompt = `Gemini老师，我在【${editingTask.title}】的讲义中做了以下几条批注和提问，请帮我逐条攻坚解答：\n\n` +
                          moduleAnnotations.map((a, i) => `${i + 1}. 原文引用：【${a.selectedText}】\n   我的疑问：${a.comment}`).join('\n\n');
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

              {modalActiveTab === 'notes' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">模块名称</label>
                    <input
                      type="text"
                      value={editingTask.title}
                      onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">讲义与 Markdown 笔记内容</label>
                    <textarea
                      value={editingTask.description || ''}
                      onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                      rows={14}
                      className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">掌握状态</label>
                      <select
                        value={editingTask.status}
                        onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                      >
                        <option value="todo">🔒 待学习 / 待补齐</option>
                        <option value="in-progress">⚡ 攻克中 (In Progress)</option>
                        <option value="review">📝 考核中 (Review)</option>
                        <option value="done">🟢 已掌握点亮 (Done)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">重要优先级</label>
                      <select
                        value={editingTask.priority}
                        onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                      >
                        <option value="critical">🔥 核心必备 (Critical)</option>
                        <option value="high">⭐ 高度推荐 (High)</option>
                        <option value="medium">🔹 标准模块 (Medium)</option>
                        <option value="low">🌱 选学扩展 (Low)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {modalActiveTab === 'gemini' && (
                <div className="space-y-4">
                  <div className="p-5 bg-gradient-to-br from-indigo-50 via-purple-50 to-emerald-50 rounded-2xl border border-indigo-100 shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🤖</span>
                      <div>
                        <h4 className="text-sm font-black text-indigo-950">Antigravity Gemini 导师联动</h4>
                        <p className="text-xs text-indigo-700 font-medium">点击一键复制 Prompt，切回当前聊天窗即可直接提问</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`Gemini老师，我想学【${editingTask.title}】，请用通俗易懂的生活例子给我讲透它的核心原理和代码逻辑！`);
                          alert('已复制！切回 Antigravity 聊天窗口粘贴发送即可。');
                        }}
                        className="p-3.5 bg-white/95 hover:bg-indigo-50 rounded-xl border border-indigo-200/80 text-left transition-all shadow-sm hover:shadow active:scale-95"
                      >
                        <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                          <span>📖</span>
                          <span>讲透核心原理</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">生活化比喻 + 逻辑拆解</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`Gemini老师，我已经学习了【${editingTask.title}】，请出一道带代码或场景的填空测试题考考我，我答对后再帮我点亮！`);
                          alert('已复制！切回 Antigravity 聊天窗口粘贴发送即可。');
                        }}
                        className="p-3.5 bg-white/95 hover:bg-purple-50 rounded-xl border border-purple-200/80 text-left transition-all shadow-sm hover:shadow active:scale-95"
                      >
                        <div className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                          <span>🎯</span>
                          <span>出一道考核题</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">实战填空 / 场景测试</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`Gemini老师，我已经通过了【${editingTask.title}】的实战练习，请帮我验收并点亮该模块！`);
                          alert('已复制！切回 Antigravity 聊天窗口粘贴发送即可。');
                        }}
                        className="p-3.5 bg-white/95 hover:bg-emerald-50 rounded-xl border border-emerald-200/80 text-left transition-all shadow-sm hover:shadow active:scale-95"
                      >
                        <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                          <span>✨</span>
                          <span>申请点亮模块</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">验收并点亮技能节点</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickSetStatus(editingTask.id, 'done')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    editingTask.status === 'done'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
                  }`}
                >
                  🟢 点亮此模块 (已掌握)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSetStatus(editingTask.id, 'in-progress')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                    editingTask.status === 'in-progress'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-700 hover:bg-blue-50 border border-blue-200'
                  }`}
                >
                  ⚡ 设为攻克中
                </button>
              </div>

              <div className="flex items-center gap-2">
                {modalActiveTab === 'notes' && (
                  <button
                    type="button"
                    onClick={handleSaveTask}
                    className="px-4 py-2 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-500/20"
                  >
                    保存笔记与修改
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingTask(null);
                  }}
                  className="px-4 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-xl text-xs font-bold transition-all"
                >
                  关闭
                </button>
              </div>
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

      {isCreateTaskModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsCreateTaskModalOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg animate-slideUp">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-semibold text-slate-900">Create New Task</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={newTaskForm.title}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                  placeholder="Enter task title"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
                  placeholder="Enter task description (optional)"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={newTaskForm.priority}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value as 'critical' | 'high' | 'medium' | 'low' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={newTaskForm.dueDate}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tags</label>
                <TagSelector
                  tags={tags}
                  selectedTagIds={newTaskForm.tags}
                  onChange={(newTagIds) => setNewTaskForm({ ...newTaskForm, tags: newTagIds })}
                />
              </div>

              {taskFormError && (
                <p className="text-sm text-red-600">{taskFormError}</p>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsCreateTaskModalOpen(false);
                  setTaskFormError('');
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                disabled={!newTaskForm.title.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateProjectOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsCreateProjectOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-slideUp border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  NEW WORKSPACE
                </span>
                <h2 className="text-lg font-black text-slate-900 mt-2">🌱 创建新的学习技能树</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateProjectOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">技能树名称 *</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="例如：Pwn 二进制漏洞利用、Web渗透测试..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">学习目标与说明</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="简要写写这个学习树的目标或涵盖的模块知识点..."
                  rows={3}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none leading-relaxed"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">视图类型</label>
                  <select
                    value={newProject.projectType}
                    onChange={(e) => setNewProject({ ...newProject, projectType: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-bold text-slate-700"
                  >
                    <option value="skill-tree">🌟 技能树 (Skill Tree)</option>
                    <option value="roadmap">📋 路线图 (Roadmap)</option>
                    <option value="kanban">📊 看板 (Kanban)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">目标达成日期</label>
                  <input
                    type="date"
                    value={newProject.targetDate}
                    onChange={(e) => setNewProject({ ...newProject, targetDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreateProjectOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={!newProject.name.trim()}
                className="px-5 py-2.5 text-xs font-bold bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-500/20 active:scale-95"
              >
                🚀 立即创建技能树
              </button>
            </div>
          </div>
        </div>
      )}

      <TagManagerModal
        isOpen={isTagManagerOpen}
        onClose={() => setIsTagManagerOpen(false)}
        projectId={selectedProject || ''}
        tags={tagsWithTaskCounts}
        onTagsChange={handleTagsChange}
      />
    </div>
  );
};

export default App;
