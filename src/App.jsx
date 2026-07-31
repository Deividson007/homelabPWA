import { useEffect, useState } from 'react'
import { database } from './database'
import './App.css'

function App() {
  const [status, setStatus] = useState('Iniciando SQLite...')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [newQuestion, setNewQuestion] = useState('')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [checklists, setChecklists] = useState([])

  const [savingQuestion, setSavingQuestion] = useState(false)
  const [savingChecklist, setSavingChecklist] = useState(false)

  useEffect(() => {
    initializeApplication()
  }, [])

  async function initializeApplication() {
    try {
      const information = await database.initialize()

      await refreshData()

      setStatus(
        `SQLite ${information.version} — armazenamento offline ativo`,
      )
    } catch (initializationError) {
      console.error(initializationError)
      setError(initializationError.message)
      setStatus('Falha ao iniciar o banco')
    }
  }

  async function refreshData() {
    const [questionList, checklistList] = await Promise.all([
      database.listQuestions(),
      database.listChecklists(),
    ])

    setQuestions(questionList)
    setChecklists(checklistList)

    setAnswers(currentAnswers => {
      const updatedAnswers = {}

      for (const question of questionList) {
        updatedAnswers[question.id] =
          currentAnswers[question.id] ?? null
      }

      return updatedAnswers
    })
  }

  async function handleAddQuestion(event) {
    event.preventDefault()

    setError('')
    setMessage('')
    setSavingQuestion(true)

    try {
      await database.addQuestion(newQuestion)
      setNewQuestion('')
      setMessage('Pergunta cadastrada no SQLite.')
      await refreshData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingQuestion(false)
    }
  }

  function handleAnswer(questionId, value) {
    setAnswers(currentAnswers => ({
      ...currentAnswers,
      [questionId]: value,
    }))
  }

  async function handleSaveChecklist(event) {
    event.preventDefault()

    setError('')
    setMessage('')

    const unansweredQuestion = questions.find(
      question => typeof answers[question.id] !== 'boolean',
    )

    if (unansweredQuestion) {
      setError(`Responda à pergunta: ${unansweredQuestion.text}`)
      return
    }

    setSavingChecklist(true)

    try {
      const checklistAnswers = questions.map(question => ({
        questionId: Number(question.id),
        value: answers[question.id],
      }))

      await database.saveChecklist(checklistAnswers)

      const clearedAnswers = Object.fromEntries(
        questions.map(question => [question.id, null]),
      )

      setAnswers(clearedAnswers)
      setMessage('Checklist gravado no SQLite com sucesso.')
      await refreshData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingChecklist(false)
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1>Checklist PWA</h1>
        <p>{status}</p>
      </header>

      {error && (
        <div className="message error">
          {error}
        </div>
      )}

      {message && (
        <div className="message success">
          {message}
        </div>
      )}

      <section className="card">
        <h2>Cadastrar pergunta</h2>

        <form onSubmit={handleAddQuestion}>
          <label htmlFor="question">
            Pergunta
          </label>

          <input
            id="question"
            type="text"
            value={newQuestion}
            onChange={event => setNewQuestion(event.target.value)}
            maxLength={300}
            placeholder="Ex.: O equipamento está funcionando?"
            required
          />

          <button type="submit" disabled={savingQuestion}>
            {savingQuestion
              ? 'Salvando...'
              : 'Adicionar pergunta'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Preencher checklist</h2>

        {questions.length === 0 ? (
          <p>Cadastre pelo menos uma pergunta.</p>
        ) : (
          <form onSubmit={handleSaveChecklist}>
            <div className="question-list">
              {questions.map((question, index) => (
                <fieldset
                  className="question"
                  key={question.id}
                >
                  <legend>
                    {index + 1}. {question.text}
                  </legend>

                  <label className="answer">
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      checked={answers[question.id] === true}
                      onChange={() => {
                        handleAnswer(question.id, true)
                      }}
                    />

                    Sim
                  </label>

                  <label className="answer">
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      checked={answers[question.id] === false}
                      onChange={() => {
                        handleAnswer(question.id, false)
                      }}
                    />

                    Não
                  </label>
                </fieldset>
              ))}
            </div>

            <button type="submit" disabled={savingChecklist}>
              {savingChecklist
                ? 'Salvando...'
                : 'Salvar checklist'}
            </button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Checklists salvos</h2>

        {checklists.length === 0 ? (
          <p>Nenhum checklist preenchido.</p>
        ) : (
          <div className="history">
            {checklists.map(checklist => (
              <article
                className="history-item"
                key={checklist.id}
              >
                <strong>Checklist #{checklist.id}</strong>

                <span>
                  Sim: {checklist.yesCount}
                </span>

                <span>
                  Não: {checklist.noCount}
                </span>

                <small>
                  {checklist.createdAt}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default App