class StarkeepHeader extends HTMLElement {
    connectedCallback() {
        fetch('/components/header.html')
            .then(res => res.text())
            .then(html => { this.innerHTML = html; });
    }
}

class StarkeepFooter extends HTMLElement {
    connectedCallback() {
        fetch('/components/footer.html')
            .then(res => res.text())
            .then(html => { this.innerHTML = html; });
    }
}

export function registerCustomElements() {
    customElements.define('starkeep-header', StarkeepHeader);
    customElements.define('starkeep-footer', StarkeepFooter);
}
