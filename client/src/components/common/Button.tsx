import { ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline'
  className?: string
  onClick?: () => void
}

export const Button = ({
  children,
  variant = 'primary',
  className = '',
  onClick,
}: ButtonProps) => {
  const base = 'px-6 py-3 rounded-lg font-medium transition-all duration-200 inline-flex items-center justify-center gap-2'
  const variants = {
    primary: 'bg-secondary text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30',
    secondary: 'bg-accent text-white hover:bg-yellow-600 shadow-lg shadow-yellow-500/30',
    outline: 'border-2 border-secondary text-secondary hover:bg-secondary hover:text-white',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} onClick={onClick}>
      {children}
    </button>
  )
}
