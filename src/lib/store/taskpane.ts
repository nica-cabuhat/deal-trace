import { create } from 'zustand'

type TaskpaneView = 'threads' | 'analysis' | 'playbook'

interface TaskpaneStore {
  // UI state only — no server data lives here
  activeView: TaskpaneView
  selectedThreadId: string | null
  setActiveView: (view: TaskpaneView) => void
  setSelectedThreadId: (id: string | null) => void
}

export const useTaskpaneStore = create<TaskpaneStore>((set) => ({
  activeView: 'threads',
  selectedThreadId: null,
  setActiveView: (view) => set({ activeView: view }),
  setSelectedThreadId: (id) => set({ selectedThreadId: id }),
}))
