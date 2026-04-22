export type ModelSelectorOption = {
  id: string
  name: string
  provider?: string
  avatarPath?: string
}

export function resolveModelSelectorState(
  modelValue: string,
  models: ModelSelectorOption[],
) {
  const normalizedValue = modelValue.trim()
  const matchedModel = models.find((model) => model.id === normalizedValue) || null
  const fallbackModel = normalizedValue ? null : models[0] || null
  const currentModel = matchedModel || fallbackModel
  const labelSource = currentModel?.id || normalizedValue || 'AI'
  const triggerLabel = labelSource.length > 24 ? `${labelSource.slice(0, 22)}...` : labelSource

  return {
    currentModel,
    triggerLabel,
    hasStaleSelection: Boolean(normalizedValue) && matchedModel === null,
  }
}
