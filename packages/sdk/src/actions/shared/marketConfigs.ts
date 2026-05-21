/**
 * Find the first config that matches a target value.
 */
export function findMatchingConfig<TConfig, TTarget>(params: {
  configs: readonly TConfig[] | undefined
  target: TTarget
  matches: (config: TConfig, target: TTarget) => boolean
}): TConfig | undefined {
  return params.configs?.find((config) => params.matches(config, params.target))
}

/**
 * Filter configs by a list of optional predicates.
 * @param configs - Candidate configs
 * @param predicates - Predicates to apply when defined
 * @returns Filtered configs
 */
export function filterMatchingConfigs<TConfig>(
  configs: readonly TConfig[] | undefined,
  predicates: ReadonlyArray<((config: TConfig) => boolean) | undefined>,
): TConfig[] {
  let filtered = [...(configs ?? [])]
  for (const predicate of predicates) {
    if (predicate) filtered = filtered.filter(predicate)
  }
  return filtered
}
