import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigError } from '../lib/supabase'
import { AuthContext } from './auth-context'
import type { AuthContextType } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(() => supabase !== null)
  const [authError, setAuthError] = useState<string | null>(
    supabaseConfigError,
  )

  useEffect(() => {
    const client = supabase
    if (!client) {
      // Configuration is missing — authError already set from supabaseConfigError.
      // loading is initialized to false when supabase is null, so nothing to do here.
      return
    }

    let active = true

    const getInitialSession = async () => {
      try {
        const { data } = await client.auth.getSession()
        if (!active) return
        setSession(data.session)
        setUser(data.session?.user ?? null)
      } catch (err) {
        if (!active) return
        setAuthError(
          err instanceof Error ? err.message : 'Failed to load session',
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void getInitialSession()

    const { data: { subscription } } = client.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
        setLoading(false)
      },
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const value: AuthContextType = {
    user,
    session,
    loading,
    authError,
    signIn: async (email, password) => {
      const client = supabase
      if (!client) throw new Error(supabaseConfigError ?? 'Supabase is not configured')
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    signUp: async (email, password) => {
      const client = supabase
      if (!client) throw new Error(supabaseConfigError ?? 'Supabase is not configured')
      const { data, error } = await client.auth.signUp({ email, password })
      if (error) throw error
      return { session: data.session }
    },
    signOut: async () => {
      const client = supabase
      if (!client) throw new Error(supabaseConfigError ?? 'Supabase is not configured')
      const { error } = await client.auth.signOut()
      if (error) throw error
    },
    resetPassword: async (email) => {
      const client = supabase
      if (!client) throw new Error(supabaseConfigError ?? 'Supabase is not configured')
      const { error } = await client.auth.resetPasswordForEmail(email)
      if (error) throw error
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}