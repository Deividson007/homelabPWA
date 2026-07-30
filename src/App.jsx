import './App.css'

function App() {
  function exibirMensagem() {
    alert('Você clicou no botão!')
  }

  return (
    <main className="app">
      <h1>Aplicativo PWA</h1>

      <button type="button" onClick={exibirMensagem}>
        Botão
      </button>
    </main>
  )
}

export default App