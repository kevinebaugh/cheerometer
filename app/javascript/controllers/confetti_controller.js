import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    // Listen for cheer events
    this.element.addEventListener("cheer:celebrate", this.celebrate.bind(this))
  }

  disconnect() {
    this.element.removeEventListener("cheer:celebrate", this.celebrate.bind(this))
  }

  celebrate() {
    this.createConfettiBurst()
  }

  createConfettiBurst() {
    const container = this.element
    const confettiCount = 50

    for (let i = 0; i < confettiCount; i++) {
      setTimeout(() => {
        this.createConfettiPiece(container)
      }, i * 20)
    }
  }

  createConfettiPiece(container) {
    const piece = document.createElement("div")
    const types = ["❄️", "✨", "🎉", "⭐", "💫"]
    const type = types[Math.floor(Math.random() * types.length)]

    piece.textContent = type
    piece.style.cssText = `
      position: absolute;
      font-size: ${20 + Math.random() * 20}px;
      left: ${Math.random() * 100}%;
      top: -20px;
      pointer-events: none;
      opacity: ${0.6 + Math.random() * 0.4};
      animation: fall ${3 + Math.random() * 4}s linear forwards;
      transform: rotate(${Math.random() * 360}deg);
    `

    // Add animation keyframes if not already added
    if (!document.getElementById("confetti-styles")) {
      const style = document.createElement("style")
      style.id = "confetti-styles"
      style.textContent = `
        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(${360 + Math.random() * 360}deg);
            opacity: 0;
          }
        }
      `
      document.head.appendChild(style)
    }

    container.appendChild(piece)

    // Remove after animation
    setTimeout(() => {
      if (piece.parentNode) {
        piece.parentNode.removeChild(piece)
      }
    }, 8000)
  }
}
