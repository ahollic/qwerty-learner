/**
 * 词典释义全量修复脚本
 *
 * 用法: DEEPSEEK_API_KEY=xxx npx tsx scripts/dict-fix/fix-dict.ts --dict CET4_T
 *
 * 流程: 加载词典 → 全量AI审核 → 有变更直接写回（修改前自动备份到 scripts/backups/）
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

// ==================== 内联类型 ====================

interface Word {
  name: string
  trans: string[]
  usphone?: string
  ukphone?: string
  notation?: string
}

interface FixConfig {
  apiEndpoint: string
  model: string
  apiKeyEnvVar: string
  batchSize: number
  concurrency: number
  targetDicts: string[]
  rules: {
    maxTranslationLength: number
    minTranslationCount: number
    placeholderValues: string[]
  }
}

// ==================== 路径常量 ====================

const DICTS_DIR = path.resolve(process.cwd(), 'public/dicts')
const BACKUP_DIR = path.resolve(process.cwd(), 'scripts/backups')
const CONFIG_PATH = path.resolve(__dirname, 'config.json')

// ==================== 词典 IO ====================

function loadDict(filename: string): Word[] {
  const filepath = path.join(DICTS_DIR, filename.endsWith('.json') ? filename : `${filename}.json`)
  if (!fs.existsSync(filepath)) {
    throw new Error(`词典文件不存在: ${filepath}`)
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

function saveDict(filename: string, words: Word[]): void {
  const filepath = path.join(DICTS_DIR, filename.endsWith('.json') ? filename : `${filename}.json`)
  fs.writeFileSync(filepath, JSON.stringify(words, null, 2) + '\n', 'utf-8')
}

// ==================== 备份 ====================

function backupDict(dictFile: string): string {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = path.join(BACKUP_DIR, `${dictFile}.${timestamp}.bak`)
  fs.copyFileSync(path.join(DICTS_DIR, dictFile), backupFile)
  return backupFile
}

// ==================== Prompt 构建 ====================

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

// ==================== API 调用 ====================

async function callDeepSeekStream(prompt: string, config: FixConfig, apiKey: string): Promise<string> {
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
        if (token) fullContent += token
      } catch {
        // 忽略解析错误
      }
    }
  }

  return fullContent.trim()
}

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

// ==================== JSON 解析 ====================

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

// ==================== 并发控制 ====================

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

// ==================== 工具函数 ====================

function isSameContent(original: string[], fixed: string[]): boolean {
  if (original.length !== fixed.length) return false
  const norm = (s: string) => s.replace(/[\s，；、（）()]/g, '').trim()
  return original.every((o, i) => norm(o) === norm(fixed[i]))
}

// ==================== 核心：全量审核 + 直接写回 ====================

interface FixResult {
  word: string
  originalTrans: string[]
  fixedTrans: string[]
}

async function fixDictFull(
  dictFile: string,
  words: Word[],
  config: FixConfig,
  apiKey: string,
): Promise<FixResult[]> {
  const batchSize = config.batchSize
  const concurrency = config.concurrency
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
    async (batch: Word[]) => {
      const inputWords = batch.map((w) => ({ name: w.name, trans: w.trans }))
      const prompt = buildFullReviewPrompt(inputWords)
      const aiResponse = await callDeepSeekStream(prompt, config, apiKey)
      const fixedMap = parseAIResponse(aiResponse)

      const results: FixResult[] = []
      for (const word of batch) {
        const fixedTrans = fixedMap[word.name]
        if (fixedTrans && Array.isArray(fixedTrans) && fixedTrans.length > 0) {
          if (!isSameContent(word.trans, fixedTrans)) {
            results.push({
              word: word.name,
              originalTrans: word.trans,
              fixedTrans,
            })
          }
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
  const missed = words.filter((w) => !returnedWords.has(w.name) && !isSameContent(w.trans, []))

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
      if (Array.isArray(parsed) && parsed.length > 0 && !isSameContent(word.trans, parsed)) {
        return {
          word: word.name,
          originalTrans: word.trans,
          fixedTrans: parsed,
        } as FixResult
      }
      return null
    })
    allResults.push(...(retryResults.filter(Boolean) as FixResult[]))
  }

  console.log(`\n  完成: ${allResults.length} 条有变更 (共 ${total} 词)`)
  return allResults
}

/** 应用修正到词典并写回 */
function applyAndSave(fixes: FixResult[], dictFile: string): number {
  if (fixes.length === 0) {
    console.log('没有需要修改的词条')
    return 0
  }

  // 备份
  const backupPath = backupDict(dictFile)
  console.log(`已备份到: ${backupPath}`)

  // 加载词典
  const words = loadDict(dictFile)

  // 建立修正索引
  const fixMap = new Map<string, FixResult>()
  for (const fix of fixes) {
    fixMap.set(fix.word, fix)
  }

  // 应用修正
  let appliedCount = 0
  for (const word of words) {
    const fix = fixMap.get(word.name)
    if (fix) {
      word.trans = fix.fixedTrans
      appliedCount++
    }
  }

  // 写回
  saveDict(dictFile, words)
  console.log(`已应用 ${appliedCount} 条修正到 ${dictFile}`)

  // 同步词条数
  try {
    execSync('node scripts/update-dict-size.js', { cwd: process.cwd() })
    console.log('已同步词条数到 dictionary.ts')
  } catch {
    console.warn('⚠ 同步词条数失败，请手动运行: node scripts/update-dict-size.js')
  }

  return appliedCount
}

// ==================== 命令行入口 ====================

async function main() {
  const args = process.argv.slice(2)
  let dictName: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dict' && args[i + 1]) {
      dictName = args[i + 1]
      break
    }
  }

  if (!dictName) {
    console.error('用法: DEEPSEEK_API_KEY=xxx npx tsx scripts/dict-fix/fix-dict.ts --dict <词典名>')
    console.error('示例: DEEPSEEK_API_KEY=xxx npx tsx scripts/dict-fix/fix-dict.ts --dict CET4_T')
    process.exit(1)
  }

  // 加载配置
  const config: FixConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))

  // 获取 API Key
  const apiKey = process.env[config.apiKeyEnvVar]
  if (!apiKey) {
    console.error(`请设置环境变量 ${config.apiKeyEnvVar}`)
    process.exit(1)
  }

  const dictFile = dictName.endsWith('.json') ? dictName : `${dictName}.json`
  console.log(`词典: ${dictFile}`)

  // 加载词典
  const words = loadDict(dictFile)
  console.log(`加载 ${words.length} 个词条`)

  // 全量审核
  const fixes = await fixDictFull(dictFile, words, config, apiKey)

  // 打印变更摘要
  if (fixes.length > 0) {
    console.log('\n=== 变更摘要 ===\n')
    for (const fix of fixes) {
      console.log(`✎ ${fix.word}: ${JSON.stringify(fix.originalTrans)} → ${JSON.stringify(fix.fixedTrans)}`)
    }
    console.log(`\n共 ${fixes.length} 条变更`)
  }

  // 直接写回
  const applied = applyAndSave(fixes, dictFile)
  console.log(`\n完成！已修改 ${applied} 条词条`)
}

main().catch((err) => {
  console.error('执行失败:', err)
  process.exit(1)
})
