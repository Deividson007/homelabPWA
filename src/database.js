const worker = new Worker(
  new URL('./sqlite.worker.js', import.meta.url),
  {
    type: 'module',
  },
)

let nextRequestId = 1
const pendingRequests = new Map()

worker.addEventListener('message', event => {
  const { id, success, result, error } = event.data
  const request = pendingRequests.get(id)

  if (!request) {
    return
  }

  pendingRequests.delete(id)

  if (success) {
    request.resolve(result)
  } else {
    request.reject(new Error(error))
  }
})

worker.addEventListener('error', event => {
  console.error('Erro no SQLite Worker:', event)

  for (const request of pendingRequests.values()) {
    request.reject(
      new Error('Não foi possível iniciar o banco SQLite.'),
    )
  }

  pendingRequests.clear()
})

function sendRequest(action, payload) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId
    nextRequestId += 1

    pendingRequests.set(id, {
      resolve,
      reject,
    })

    worker.postMessage({
      id,
      action,
      payload,
    })
  })
}

export const database = {
  initialize() {
    return sendRequest('database:initialize')
  },

  listQuestions() {
    return sendRequest('questions:list')
  },

  addQuestion(text) {
    return sendRequest('questions:add', {
      text,
    })
  },

  saveChecklist(answers) {
    return sendRequest('checklists:save', {
      answers,
    })
  },

  listChecklists() {
    return sendRequest('checklists:list')
  },
}