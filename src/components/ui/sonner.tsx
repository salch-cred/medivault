'use client'

import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            'rounded-xl border border-border bg-card text-card-foreground shadow-lg',
        },
      }}
    />
  )
}
