import { useUploader } from '../UploaderContext'
import type { FormState } from '../types'
import type { ReactNode } from 'react'

interface BaseProps {
  field: keyof FormState
  label?: ReactNode
  hint?: ReactNode
  required?: boolean
  placeholder?: string
  className?: string
}

export function Input({
  field,
  label,
  hint,
  required,
  placeholder,
  className = '',
  type = 'text',
  onBlur,
}: BaseProps & { type?: string; onBlur?: () => void }) {
  const { form, setField } = useUploader()
  return (
    <div className={`field ${className}`}>
      {label && (
        <label>
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <input
        type={type}
        value={form[field]}
        placeholder={placeholder}
        onChange={(e) => setField(field, e.target.value)}
        onBlur={onBlur}
      />
      {hint && <div className="text-[11px] leading-snug text-muted2">{hint}</div>}
    </div>
  )
}

export function Textarea({
  field,
  label,
  hint,
  required,
  placeholder,
  className = '',
  rows = 5,
}: BaseProps & { rows?: number }) {
  const { form, setField } = useUploader()
  return (
    <div className={`field ${className}`}>
      {label && (
        <label>
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <textarea
        rows={rows}
        value={form[field]}
        placeholder={placeholder}
        onChange={(e) => setField(field, e.target.value)}
        className="resize-y leading-relaxed"
      />
      {hint && <div className="text-[11px] leading-snug text-muted2">{hint}</div>}
    </div>
  )
}

export function Select({
  field,
  label,
  hint,
  options,
  className = '',
}: BaseProps & { options: { value: string; label: string }[] }) {
  const { form, setField } = useUploader()
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      <select value={form[field]} onChange={(e) => setField(field, e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <div className="text-[11px] leading-snug text-muted2">{hint}</div>}
    </div>
  )
}

export function Card({
  title,
  icon,
  right,
  children,
}: {
  title: ReactNode
  icon?: ReactNode
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="card mb-4">
      <div className="card-header">
        <h3 className="flex items-center gap-2.5 text-[13px] font-bold">
          {icon && (
            <span className="flex h-[27px] w-[27px] items-center justify-center rounded-lg bg-brand/12 text-brand-2">
              {icon}
            </span>
          )}
          {title}
        </h3>
        {right}
      </div>
      <div className="card-body">{children}</div>
    </div>
  )
}
