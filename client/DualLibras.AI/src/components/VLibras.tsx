import type { HTMLAttributes } from 'react'
import { useCallback, useEffect, useRef } from 'react'

type VLibrasProps = {
  text: string
  targetId: string
}

type VLibrasElementProps = HTMLAttributes<HTMLDivElement> & {
  vw?: string
  'vw-access-button'?: string
  'vw-plugin-wrapper'?: string
}

declare global {
  interface Window {
    VLibras?: {
      Widget: new (url: string) => unknown
    }
    plugin?: {
      translate?: (text: string) => void
    }
    __vlibrasWidgetStarted?: boolean
    __vlibrasWidgetBooted?: boolean
  }
}

const SCRIPT_ID = 'vlibras-widget-script'
const SCRIPT_SRC = 'https://vlibras.gov.br/app/vlibras-plugin.js'
const TRANSLATE_DELAY_MS = 450
const READY_RETRY_MS = 500
const MAX_TRANSLATE_ATTEMPTS = 24
const CENTER_WIDGET_DELAY_MS = 250

export default function VLibras({ text, targetId }: VLibrasProps) {
  const initialized = useRef(false)
  const lastTriggeredText = useRef('')
  const readyTimer = useRef<number | null>(null)

  const centerWidget = useCallback(() => {
    const root = document.querySelector<HTMLElement>('[vw].enabled')
    const wrapper = document.querySelector<HTMLElement>('[vw-plugin-wrapper]')

    if (root) {
      root.classList.add('vlibras-centered')
    }

    if (wrapper) {
      wrapper.classList.add('vlibras-center-wrapper')
    }
  }, [])

  const bootWidget = useCallback(() => {
    if (!window.VLibras) {
      return false
    }

    if (!window.__vlibrasWidgetStarted) {
      new window.VLibras.Widget('https://vlibras.gov.br/app')
      window.__vlibrasWidgetStarted = true
    }

    const widgetMounted = Boolean(
      document.querySelector('[vw-access-button] .vp-access-button')
      && document.querySelector('[vw-plugin-wrapper] [vp]'),
    )

    if (!widgetMounted && !window.__vlibrasWidgetBooted && typeof window.onload === 'function') {
      window.__vlibrasWidgetBooted = true
      window.onload.call(window, new Event('load'))
    }

    return true
  }, [])

  const openWidget = useCallback(() => {
    bootWidget()

    const accessButton = document.querySelector<HTMLElement>('[vw-access-button]')
    const wrapper = document.querySelector<HTMLElement>('[vw-plugin-wrapper]')

    if (!accessButton || !wrapper) {
      return false
    }

    if (!wrapper.classList.contains('active')) {
      accessButton.click()
    }

    window.setTimeout(centerWidget, CENTER_WIDGET_DELAY_MS)
    return true
  }, [bootWidget, centerWidget])

  const triggerTranslation = useCallback(() => {
    const textoAtual = text.trim()

    if (!textoAtual) {
      return false
    }

    if (!openWidget()) {
      return false
    }

    if (typeof window.plugin?.translate !== 'function') {
      return false
    }

    window.plugin.translate(textoAtual)
    centerWidget()

    return true
  }, [centerWidget, openWidget, text])

  useEffect(() => {
    if (initialized.current) {
      return
    }

    initialized.current = true

    const startWidget = () => {
      if (!window.VLibras) {
        return
      }

      bootWidget()
      readyTimer.current = window.setTimeout(openWidget, 1600)
      window.setTimeout(centerWidget, 2200)
    }

    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

    if (existingScript) {
      startWidget()
    } else {
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      script.onload = startWidget
      script.onerror = () => {
        console.error('Não foi possível carregar o script do VLibras.')
      }

      document.head.appendChild(script)
    }

    return () => {
      if (readyTimer.current) {
        window.clearTimeout(readyTimer.current)
      }
    }
  }, [bootWidget, centerWidget, openWidget])

  useEffect(() => {
    const textoAtual = text.trim()

    if (!textoAtual || textoAtual === lastTriggeredText.current) {
      return
    }

    lastTriggeredText.current = textoAtual
    let attempt = 0
    let timer: number

    const runTranslation = () => {
      attempt += 1

      if (triggerTranslation() || attempt >= MAX_TRANSLATE_ATTEMPTS) {
        return
      }

      timer = window.setTimeout(runTranslation, READY_RETRY_MS)
    }

    timer = window.setTimeout(runTranslation, TRANSLATE_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [targetId, text, triggerTranslation])

  const rootProps: VLibrasElementProps = {
    vw: ' ',
    className: 'enabled vlibras-widget',
  }

  const accessButtonProps: VLibrasElementProps = {
    'vw-access-button': ' ',
    className: 'active',
  }

  const wrapperProps: VLibrasElementProps = {
    'vw-plugin-wrapper': ' ',
    className: 'vlibras-center-wrapper',
  }

  return (
    <div {...rootProps}>
      <div {...accessButtonProps} />
      <div {...wrapperProps}>
        <div className="vw-plugin-top-wrapper" />
      </div>
    </div>
  )
}
