import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { config } from '@/config'
import { logger } from '@/utils/logger'
import * as authApi from '@/api/auth'
import type { UserInfo, LoginResponse } from '@/api/types'
import { getGuestDeviceFingerprint, getGuestDeviceId } from './authGuestSession'
import {
  clearStoredAuthSession,
  clearStoredGuestRecoveryToken,
  clearStoredUserInfo,
  readStoredAuthSession,
  writeStoredAuthSession,
  writeStoredRefreshSession,
  writeStoredUserInfo,
} from './authSessionStorage'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const refreshTokenValue = ref<string | null>(null)
  const userInfo = shallowRef<UserInfo | null>(null)
  const guestSession = ref(false)
  const guestRecoveryToken = ref<string | null>(null)
  let guestAuthPromise: Promise<string> | null = null

  const isLoggedIn = computed(() => !!token.value)
  const refreshToken = computed(() => refreshTokenValue.value)
  const isGuest = computed(() => !!token.value && guestSession.value)

  function loadFromStorage() {
    const snapshot = readStoredAuthSession()
    token.value = snapshot.token
    refreshTokenValue.value = snapshot.refreshToken
    userInfo.value = snapshot.userInfo
    guestSession.value = snapshot.guestSession
    guestRecoveryToken.value = snapshot.guestRecoveryToken
  }

  function applyAuthSession(data: LoginResponse, isGuestSession: boolean) {
    const snapshot = writeStoredAuthSession(data, isGuestSession, guestRecoveryToken.value)
    token.value = snapshot.accessToken
    refreshTokenValue.value = snapshot.refreshToken
    userInfo.value = snapshot.userInfo
    guestSession.value = isGuestSession
    guestRecoveryToken.value = snapshot.guestRecoveryToken
  }

  function clearGuestRecoveryToken() {
    guestRecoveryToken.value = null
    clearStoredGuestRecoveryToken()
  }

  function handleLoginSuccess(data: LoginResponse) {
    clearGuestRecoveryToken()
    applyAuthSession(data, false)
  }

  function setGuestToken(data: LoginResponse) {
    applyAuthSession(data, true)
  }

  async function refreshAccessToken(): Promise<string> {
    if (!refreshTokenValue.value) throw new Error('No refresh token')

    const res = await authApi.refreshToken({ refreshToken: refreshTokenValue.value })
    const snapshot = writeStoredRefreshSession(res.data, guestSession.value)

    token.value = snapshot.accessToken
    if (snapshot.refreshToken) {
      refreshTokenValue.value = snapshot.refreshToken
    }
    if (snapshot.userInfo) {
      userInfo.value = snapshot.userInfo
    }

    return snapshot.accessToken
  }

  async function issueGuestSession(): Promise<string> {
    const res = await authApi.guestLogin({
      deviceId: getGuestDeviceId(),
      recoveryToken: guestRecoveryToken.value || undefined,
      deviceFingerprint: getGuestDeviceFingerprint(),
    })
    setGuestToken(res.data)
    return res.data.accessToken || res.data.token
  }

  function withGuestAuthLock(factory: () => Promise<string>) {
    if (guestAuthPromise) {
      return guestAuthPromise
    }
    guestAuthPromise = factory().finally(() => {
      guestAuthPromise = null
    })
    return guestAuthPromise
  }

  async function ensureGuestSession(): Promise<string> {
    if (!config.features.guestAuth) {
      throw new Error('Guest auth disabled')
    }
    return withGuestAuthLock(issueGuestSession)
  }

  async function recoverGuestSession(): Promise<string> {
    if (!config.features.guestAuth) {
      throw new Error('Guest auth disabled')
    }
    return withGuestAuthLock(async () => {
      if (refreshTokenValue.value) {
        try {
          const nextToken = await refreshAccessToken()
          guestSession.value = true
          return nextToken
        } catch (error) {
          logger.warn('[auth] guest refresh failed, fallback to guest re-auth:', error)
        }
      }
      clearAuth({ clearGuestRecoveryToken: false })
      return issueGuestSession()
    })
  }

  async function fetchUserInfo() {
    if (!token.value) {
      userInfo.value = null
      clearStoredUserInfo()
      return
    }
    try {
      const res = await authApi.getMe()
      userInfo.value = res.data
      writeStoredUserInfo(res.data)
    } catch (e) {
      logger.warn('[auth] fetchUserInfo failed:', e)
    }
  }

  async function ensureAuth(): Promise<void> {
    loadFromStorage()
  }

  function clearAuth(options: { clearGuestRecoveryToken?: boolean } = {}) {
    token.value = null
    refreshTokenValue.value = null
    userInfo.value = null
    guestSession.value = false
    clearStoredAuthSession(options)
    if (options.clearGuestRecoveryToken) {
      clearGuestRecoveryToken()
    }
  }

  async function doLogout() {
    try {
      if (refreshTokenValue.value) {
        await authApi.logout({ refreshToken: refreshTokenValue.value })
      }
    } catch {
      // ignore
    } finally {
      clearAuth({ clearGuestRecoveryToken: true })
    }
  }

  return {
    token,
    refreshToken,
    userInfo,
    guestRecoveryToken,
    isLoggedIn,
    isGuest,
    loadFromStorage,
    handleLoginSuccess,
    setGuestToken,
    refreshAccessToken,
    ensureGuestSession,
    recoverGuestSession,
    fetchUserInfo,
    ensureAuth,
    clearGuestRecoveryToken,
    clearAuth,
    doLogout,
  }
})
