import type { FixConfig, DictIssue, FixResult, Word } from './types.js'

// ============ Prompt 构建 ============

function buildSingleWordPrompt(word: string, currentTrans: string[]): string {
  return `单词: ${word}
当前释义: ${JSON.stringify(currentTrans)}

请参照剑桥词典风格，直接输出修正后的释义 JSON 数组，不要输出任何其他内容。

释义规则:
1. 当一个词有多个含义需要区分语境时，用中文圆括号加语境标注，如：（讨论、考虑或研究的）主题，话题
2. 语境括号只用于确实需要区分的多义词——含义明确的不要硬加
3. 每条释义尽量涵盖该词性下的主要含义
4. 格式: ["释义1", "释义2"]`
}

function buildBatchPrompt(words: Array<{ name: string; trans: string[] }>): string {
  const wordList = words.map((w, i) => `${i + 1}. ${w.name} (当前: ${w.trans.join('; ')})`).join('\n')

  return `你是英语-汉语词典编纂专家。请参照剑桥词典风格，为以下单词提供准确、地道、易懂的中文释义。

释义规则:
1. 释义准确、地道、易懂，按词性分组，常用含义优先
2. 当一个词有多个含义需要区分语境时，用中文圆括号 () 加语境标注，格式如：（讨论、考虑或研究的）主题，话题
3. 语境括号只用于确实需要区分的多义词——如果含义已经很明确（如"银行""春天"），不要硬加括号
4. 每条释义尽量涵盖该词性下的主要含义，用顿号或逗号分隔，不必拆成太多条
5. 当前释义已经足够好的，保持不变
6. 严格输出 JSON，不要输出 markdown 代码块标记

示例:
  subject → ["（讨论、考虑或研究的）主题，话题；问题；题目；学科；（语法的）主语", "使服从，使隶属"]
  charge → ["（向…）索价，要价；控告，指控；充电；向前冲", "费用；指控；（物体的）电荷"]
  spring → ["春天；弹簧，发条；泉水", "跳，跃；突然出现"]
  bank → ["银行；堤，岸"]

${wordList}

输出格式:
{
  "${words[0].name}": ["释义1", "释义2"],
  ...
}`
}

/** 全量审核用的 prompt —— 对每个词都输出释义 */
function buildFullReviewPrompt(words: Array<{ name: string; trans: string[] }>): string {
  const wordList = words.map((w, i) => `${i + 1}. ${w.name}: ${JSON.stringify(w.trans)}`).join('\n')

  return `你是英语-汉语词典编纂专家，负责审核和优化词典释义。请参照剑桥词典风格，逐一审核以下单词的中文释义。

审核规则:
1. 每个单词都必须输出，不能遗漏
2. 释义准确、地道、易懂，按词性分组，常用含义优先
3. 多义词需要区分语境时，用中文圆括号 () 加语境标注，如：（讨论、考虑或研究的）主题，话题
4. 语境括号只用于确实需要区分的多义词——含义明确的（如"银行""春天"）不要硬加
5. 每条释义尽量涵盖该词性下的主要含义，用顿号或逗号分隔
6. 当前释义已经准确完整的，保持不变；有遗漏或错误的，补全修正
7. 严格输出 JSON，不要输出 markdown 代码块标记

示例输入:
  subject: ["科目"]
  charge: ["充电"]
  bank: ["银行"]
  spring: ["春天"]

示例输出:
{
  "subject": ["（讨论、考虑或研究的）主题，话题；问题；题目；学科；（语法的）主语", "使服从，使隶属"],
  "charge": ["（向…）索价，要价；控告，指控；充电；向前冲", "费用；指控；（物体的）电荷"],
  "bank": ["银行；堤，岸"],
  "spring": ["春天；弹簧，发条；泉水", "跳，跃；突然出现"]
}

待审核词条:
${wordList}

输出格式（所有单词都必须出现）:
{
  "${words[0].name}": ["释义1", "释义2"],
  ...
}`
}

// ============ API 调用（流式） ============

interface StreamCallbacks {
  onToken?: (token: string) => void
}

async function callDeepSeekStream(prompt: string, config: FixConfig, apiKey: string, callbacks?: StreamCallbacks): Promise<string> {
  const response = await fetch(config.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            '你是英语-汉语词典编纂专家，参照剑桥词典风格。多义词需要时用中文圆括号加语境标注，如（讨论、研究的）主题。含义明确的不加。直接输出JSON，不要markdown代码块标记。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  })

  if (!response.ok) {
    // 如果不支持流式，回退到非流式
    if (response.status === 400) {
      return callDeepSeekNonStream(prompt, config, apiKey)
    }
    const errorText = await response.text()
    throw new Error(`DeepSeek API 错误 (${response.status}): ${errorText}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        const token = parsed.choices?.[0]?.delta?.content || ''
        if (token) {
          fullContent += token
          callbacks?.onToken?.(token)
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  return fullContent.trim()
}

/** 非流式调用（备选） */
async function callDeepSeekNonStream(prompt: string, config: FixConfig, apiKey: string): Promise<string> {
  const response = await fetch(config.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            '你是英语-汉语词典编纂专家，参照剑桥词典风格。多义词需要时用中文圆括号加语境标注，如（讨论、研究的）主题。含义明确的不加。直接输出JSON，不要markdown代码块标记。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DeepSeek API 错误 (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  return data.choices[0].message.content.trim()
}

// ============ JSON 解析 ============

function parseAIResponse(content: string): Record<string, string[]> {
  let cleaned = content
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  cleaned = cleaned.trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    throw new Error(`无法解析 AI 返回的 JSON: ${cleaned.substring(0, 200)}`)
  }
}

// ============ 并发控制 ============

/** 带并发限制的 Promise 执行器 */
async function parallelExec<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  let completed = 0

  const worker = async () => {
    while (nextIndex < items.length) {
      const idx = nextIndex++
      try {
        results[idx] = await fn(items[idx], idx)
      } catch (err) {
        // 单个失败不影响其他，结果设为 undefined
        results[idx] = undefined as unknown as R
        console.error(`  ✗ 第${idx + 1}批失败: ${(err as Error).message}`)
      }
      completed++
      onProgress?.(completed, items.length)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results.filter((r) => r !== undefined)
}

// ============ 核心：并发批量修正 ============

interface BatchTask {
  batch: DictIssue[]
  batchIndex: number
}

export async function fixBatch(
  issues: DictIssue[],
  config: FixConfig,
  apiKey: string,
  onProgress?: (done: number, total: number) => void,
): Promise<FixResult[]> {
  const batchSize = config.batchSize
  const concurrency = (config as any).concurrency || 3

  // 分批
  const tasks: BatchTask[] = []
  for (let i = 0; i < issues.length; i += batchSize) {
    tasks.push({
      batch: issues.slice(i, i + batchSize),
      batchIndex: Math.floor(i / batchSize) + 1,
    })
  }

  console.log(`  并发数: ${concurrency}, 批次数: ${tasks.length}, 每批: ${batchSize} 词`)

  // 并发执行
  const batchResults = await parallelExec(
    tasks,
    concurrency,
    async (task: BatchTask) => {
      const { batch, batchIndex } = task
      const words = batch.map((issue) => ({ name: issue.word, trans: issue.currentTrans }))
      const prompt = buildBatchPrompt(words)

      const aiResponse = await callDeepSeekStream(prompt, config, apiKey)
      const fixedMap = parseAIResponse(aiResponse)

      const results: FixResult[] = []
      for (const issue of batch) {
        const fixedTrans = fixedMap[issue.word]
        if (fixedTrans && Array.isArray(fixedTrans) && fixedTrans.length > 0) {
          results.push({
            word: issue.word,
            dictFile: issue.dictFile,
            originalTrans: issue.currentTrans,
            fixedTrans,
            autoApproved: isMinorChange(issue.currentTrans, fixedTrans),
            issueType: issue.issueType,
          })
        } else {
          console.warn(`  ⚠ 未返回 ${issue.word} 的有效释义`)
        }
      }
      return results
    },
    (done, total) => {
      process.stdout.write(`  进度: ${done}/${total} 批次完成\r`)
      onProgress?.(done, total)
    },
  )

  // 失败的批次，单个重试（也是并发的）
  const allResults = batchResults.flat()
  const failedWords = issues.filter((issue) => !allResults.some((r) => r && r.word === issue.word))

  if (failedWords.length > 0) {
    console.log(`\n  重试 ${failedWords.length} 个失败词条...`)
    const retryResults = await parallelExec(failedWords, Math.min(concurrency, 5), async (issue: DictIssue) => {
      const singlePrompt = buildSingleWordPrompt(issue.word, issue.currentTrans)
      const aiResponse = await callDeepSeekNonStream(singlePrompt, config, apiKey)
      let parsed: string[]
      try {
        const raw = aiResponse
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '')
          .trim()
        parsed = JSON.parse(raw)
      } catch {
        return null
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          word: issue.word,
          dictFile: issue.dictFile,
          originalTrans: issue.currentTrans,
          fixedTrans: parsed,
          autoApproved: isMinorChange(issue.currentTrans, parsed),
          issueType: issue.issueType,
        } as FixResult
      }
      return null
    })

    allResults.push(...(retryResults.filter(Boolean) as FixResult[]))
  }

  return allResults
}

/** 判断是否为小改动 */
function isMinorChange(original: string[], fixed: string[]): boolean {
  const normalize = (arr: string[]) =>
    arr
      .map((s) => s.replace(/[\s，；、（）()]/g, '').trim())
      .sort()
      .join('|')
  return normalize(original) === normalize(fixed)
}

/** 对单个词典进行完整修正流程（仅修问题词） */
export async function fixDict(dictFile: string, issues: DictIssue[], config: FixConfig, apiKey: string): Promise<FixResult[]> {
  console.log(`\n修正 ${dictFile} (${issues.length} 个问题)...`)
  const results = await fixBatch(issues, config, apiKey)
  console.log(`  完成: ${results.length} 条修正 (共 ${issues.length} 个问题)`)
  return results
}

/** 全量审核词典：把所有词条都发给 AI 审核 */
export async function fixDictFull(dictFile: string, words: Word[], config: FixConfig, apiKey: string): Promise<FixResult[]> {
  const batchSize = config.batchSize
  const concurrency = (config as any).concurrency || 3
  const total = words.length

  console.log(`\n全量审核 ${dictFile} (${total} 词)...`)

  // 分批
  const batches: Word[][] = []
  for (let i = 0; i < total; i += batchSize) {
    batches.push(words.slice(i, i + batchSize))
  }

  console.log(`  并发数: ${concurrency}, 批次数: ${batches.length}, 每批: ${batchSize} 词`)

  const batchResults = await parallelExec(
    batches,
    concurrency,
    async (batch: Word[], batchIndex: number) => {
      const inputWords = batch.map((w) => ({ name: w.name, trans: w.trans }))
      const prompt = buildFullReviewPrompt(inputWords)

      const aiResponse = await callDeepSeekStream(prompt, config, apiKey)
      const fixedMap = parseAIResponse(aiResponse)

      const results: FixResult[] = []
      for (const word of batch) {
        const fixedTrans = fixedMap[word.name]
        if (fixedTrans && Array.isArray(fixedTrans) && fixedTrans.length > 0) {
          const changed = !isSameContent(word.trans, fixedTrans)
          results.push({
            word: word.name,
            dictFile,
            originalTrans: word.trans,
            fixedTrans,
            autoApproved: !changed, // 没改动的自动通过
            issueType: changed ? 'inaccurate' : 'oversimplified',
          })
        } else {
          console.warn(`  ⚠ 未返回 ${word.name} 的有效释义`)
        }
      }
      return results
    },
    (done, total) => {
      process.stdout.write(`  进度: ${done}/${total} 批次完成\r`)
    },
  )

  const allResults = batchResults.flat()

  // 重试丢失的词
  const returnedWords = new Set(allResults.map((r) => r.word))
  const missed = words.filter((w) => !returnedWords.has(w.name))

  if (missed.length > 0) {
    console.log(`\n  重试 ${missed.length} 个遗漏词条...`)
    const retryResults = await parallelExec(missed, Math.min(concurrency, 5), async (word: Word) => {
      const singlePrompt = buildSingleWordPrompt(word.name, word.trans)
      const aiResponse = await callDeepSeekNonStream(singlePrompt, config, apiKey)
      let parsed: string[]
      try {
        const raw = aiResponse
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '')
          .trim()
        parsed = JSON.parse(raw)
      } catch {
        return null
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        const changed = !isSameContent(word.trans, parsed)
        return {
          word: word.name,
          dictFile,
          originalTrans: word.trans,
          fixedTrans: parsed,
          autoApproved: !changed,
          issueType: changed ? 'inaccurate' : 'oversimplified',
        } as FixResult
      }
      return null
    })
    allResults.push(...(retryResults.filter(Boolean) as FixResult[]))
  }

  const changed = allResults.filter((r) => !r.autoApproved)
  const unchanged = allResults.filter((r) => r.autoApproved)
  console.log(`\n  完成: ${changed.length} 条有变更, ${unchanged.length} 条保持不变 (共 ${total} 词)`)

  // 只返回有实际变更的
  return changed
}

/** 判断释义内容是否完全相同 */
function isSameContent(original: string[], fixed: string[]): boolean {
  if (original.length !== fixed.length) return false
  const norm = (s: string) => s.replace(/[\s，；、（）()]/g, '').trim()
  return original.every((o, i) => norm(o) === norm(fixed[i]))
}
