'use client'
import { useState } from 'react'
import type { FocusCheckResult } from '@/components/project-context/FocusGuardModal'

// ─────────────────────────────────────────────────
// useFocusGuard — small client-side helper that wraps the focus-check
// API + a confirm-modal state machine. Callers do:
//
//   const guard = useFocusGuard()
//   async function onSubmit() {
//     const ok = await guard.check({
//       projectId, taskTitle, taskDescription,
//       onProceed: createTaskInDb,
//       onOffFocusConfirmed: async (result) => {
//         // user clicked "Create Anyway" → write risk activity then create
//       },
//     })
//   }
//
// If the project is unlocked or the task is in focus, the helper proceeds
// immediately. Otherwise it opens the modal and waits for the user.
// ─────────────────────────────────────────────────

export interface GuardCheckArgs {
  projectId: string
  taskTitle: string
  taskDescription?: string
}

interface ModalState {
  open: boolean
  taskTitle: string
  result: FocusCheckResult | null
  loading: boolean
  // Internal: callbacks registered by the caller
  resolveConfirm?: (proceed: boolean) => void
  result_for_caller?: FocusCheckResult | null
}

export interface UseFocusGuard {
  modalState: ModalState
  // Returns { proceed, result }.
  // - proceed=true if no focus problem OR user clicked "Create Anyway"
  // - proceed=false if user clicked "Cancel"
  // - result contains the focus-check payload (off_focus etc.) regardless
  check: (args: GuardCheckArgs) => Promise<{ proceed: boolean; result: FocusCheckResult | null }>
  confirm: () => void
  cancel: () => void
}

const INITIAL: ModalState = {
  open: false, taskTitle: '', result: null, loading: false,
}

export function useFocusGuard(): UseFocusGuard {
  const [modalState, setModalState] = useState<ModalState>(INITIAL)

  async function check(args: GuardCheckArgs) {
    if (!args.projectId || !args.taskTitle?.trim()) {
      return { proceed: true, result: null }
    }

    // Run focus check
    let result: FocusCheckResult | null = null
    try {
      const r = await fetch(`/api/projects/${args.projectId}/focus-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_title: args.taskTitle, task_description: args.taskDescription }),
      })
      if (r.ok) result = await r.json()
    } catch { /* network err → don't block creation */ }

    // No problem → proceed silently
    if (!result || !result.off_focus) return { proceed: true, result }

    // Off-focus but project unlocked → don't block; return result so caller
    // can decide to show a soft hint if they want
    if (!result.locked) return { proceed: true, result }

    // Off-focus AND locked → open modal, await user choice
    return new Promise<{ proceed: boolean; result: FocusCheckResult }>(resolve => {
      setModalState({
        open: true, taskTitle: args.taskTitle, result, loading: false,
        resolveConfirm: (proceed) => resolve({ proceed, result }),
      })
    })
  }

  function confirm() {
    setModalState(s => {
      s.resolveConfirm?.(true)
      return INITIAL
    })
  }
  function cancel() {
    setModalState(s => {
      s.resolveConfirm?.(false)
      return INITIAL
    })
  }

  return { modalState, check, confirm, cancel }
}
