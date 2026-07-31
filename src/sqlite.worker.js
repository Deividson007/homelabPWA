import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

let databasePromise

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = initializeDatabase()
  }

  return databasePromise
}

async function initializeDatabase() {
  if (!self.crossOriginIsolated) {
    throw new Error(
      'O navegador não está isolado. Verifique os cabeçalhos COOP e COEP.',
    )
  }

  const sqlite3 = await sqlite3InitModule({
    print: console.log,
    printErr: console.error,
  })

  const opfsAvailable =
  typeof sqlite3.oo1?.OpfsDb === 'function'

if (!opfsAvailable) {
  console.error('Diagnóstico do OPFS:', {
    crossOriginIsolated: self.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer,
    opfsDb: typeof sqlite3.oo1?.OpfsDb,
  })

  throw new Error(
    'OPFS indisponível. Verifique os cabeçalhos COOP/COEP.',
  )
}

  const db = new sqlite3.oo1.OpfsDb('/checklist.sqlite3')

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
        CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS checklist_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_run_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      value INTEGER NOT NULL
        CHECK (value IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (checklist_run_id)
        REFERENCES checklist_runs(id)
        ON DELETE CASCADE,

      FOREIGN KEY (question_id)
        REFERENCES questions(id),

      UNIQUE (checklist_run_id, question_id)
    );
  `)

  return {
    sqlite3,
    db,
  }
}

function listQuestions(db) {
  return db
    .selectObjects(`
      SELECT
        id,
        text,
        created_at AS createdAt
      FROM questions
      WHERE active = 1
      ORDER BY id
    `)
    .map(row => ({ ...row }))
}

function addQuestion(db, payload) {
  const text = String(payload?.text ?? '').trim()

  if (!text) {
    throw new Error('Informe o texto da pergunta.')
  }

  if (text.length > 300) {
    throw new Error('A pergunta deve ter no máximo 300 caracteres.')
  }

  db.exec({
    sql: `
      INSERT INTO questions (text)
      VALUES (?)
    `,
    bind: [text],
  })

  return {
    id: Number(db.selectValue('SELECT last_insert_rowid()')),
    text,
  }
}

function saveChecklist(db, payload) {
  const receivedAnswers = payload?.answers

  if (!Array.isArray(receivedAnswers)) {
    throw new Error('As respostas são obrigatórias.')
  }

  const questions = listQuestions(db)
  const answerMap = new Map()

  for (const answer of receivedAnswers) {
    const questionId = Number(answer?.questionId)

    if (!Number.isInteger(questionId)) {
      throw new Error('Foi encontrada uma pergunta inválida.')
    }

    if (typeof answer?.value !== 'boolean') {
      throw new Error('Todas as perguntas devem ser respondidas.')
    }

    answerMap.set(questionId, answer.value)
  }

  for (const question of questions) {
    if (!answerMap.has(Number(question.id))) {
      throw new Error(`Responda à pergunta: ${question.text}`)
    }
  }

  return db.transaction('IMMEDIATE', transaction => {
    transaction.exec(`
      INSERT INTO checklist_runs DEFAULT VALUES
    `)

    const checklistId = Number(
      transaction.selectValue('SELECT last_insert_rowid()'),
    )

    for (const question of questions) {
      const questionId = Number(question.id)
      const value = answerMap.get(questionId)

      transaction.exec({
        sql: `
          INSERT INTO answers (
            checklist_run_id,
            question_id,
            question_text,
            value
          )
          VALUES (?, ?, ?, ?)
        `,
        bind: [
          checklistId,
          questionId,
          question.text,
          value ? 1 : 0,
        ],
      })
    }

    return {
      id: checklistId,
    }
  })
}

function listChecklists(db) {
  return db
    .selectObjects(`
      SELECT
        checklist_runs.id,
        checklist_runs.created_at AS createdAt,
        COUNT(answers.id) AS total,
        COALESCE(
          SUM(CASE WHEN answers.value = 1 THEN 1 ELSE 0 END),
          0
        ) AS yesCount,
        COALESCE(
          SUM(CASE WHEN answers.value = 0 THEN 1 ELSE 0 END),
          0
        ) AS noCount
      FROM checklist_runs
      LEFT JOIN answers
        ON answers.checklist_run_id = checklist_runs.id
      GROUP BY checklist_runs.id
      ORDER BY checklist_runs.id DESC
    `)
    .map(row => ({
      id: Number(row.id),
      createdAt: row.createdAt,
      total: Number(row.total),
      yesCount: Number(row.yesCount),
      noCount: Number(row.noCount),
    }))
}

self.addEventListener('message', async event => {
  const { id, action, payload } = event.data

  try {
    const { sqlite3, db } = await getDatabase()

    let result

    switch (action) {
      case 'database:initialize':
        result = {
          version: sqlite3.version.libVersion,
          filename: db.filename,
          persistent: true,
        }
        break

      case 'questions:list':
        result = listQuestions(db)
        break

      case 'questions:add':
        result = addQuestion(db, payload)
        break

      case 'checklists:save':
        result = saveChecklist(db, payload)
        break

      case 'checklists:list':
        result = listChecklists(db)
        break

      default:
        throw new Error(`Operação desconhecida: ${action}`)
    }

    self.postMessage({
      id,
      success: true,
      result,
    })
  } catch (error) {
    console.error(error)

    self.postMessage({
      id,
      success: false,
      error: error instanceof Error
        ? error.message
        : String(error),
    })
  }
})