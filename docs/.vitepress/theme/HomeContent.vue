<template>
  <div class="home-shell">
    <div class="signal-row">
      <div class="signal"><strong>4</strong><span>small, composable primitives</span></div>
      <div class="signal"><strong>8 / 8</strong><span>public browser evals passing</span></div>
      <div class="signal"><strong>0</strong><span>raw HTML trees sent to Jev</span></div>
      <div class="signal"><strong>1.7s</strong><span>five-field iframe form run*</span></div>
    </div>

    <section class="home-section">
      <p class="eyebrow">A different control loop</p>
      <h2>Keep Playwright. Add a decision engine.</h2>
      <p class="lede">
        PlayJev converts the live browser into a sparse, numbered YAML tree. Jev ranks bounded
        candidates, chooses a target or operation, and verifies outcomes. Playwright remains the
        execution layer.
      </p>
      <div class="pipeline" aria-label="PlayJev architecture">
        <div class="pipe-node">Live page</div>
        <div class="pipe-arrow">→</div>
        <div class="pipe-node">Sparse YAML</div>
        <div class="pipe-arrow">→</div>
        <div class="pipe-node accent">Jev decision</div>
        <div class="pipe-arrow">→</div>
        <div class="pipe-node">Playwright</div>
      </div>
    </section>

    <section class="home-section">
      <p class="eyebrow">The public surface</p>
      <h2>Four methods. Each one has a job.</h2>
      <div class="primitive-grid">
        <div class="primitive-card">
          <span class="number">01 / NOUL</span><code>check()</code>
          <p>Ask a yes-or-no question about the current browser state, with a probability.</p>
        </div>
        <div class="primitive-card">
          <span class="number">02 / CHOICE</span><code>choose()</code>
          <p>Choose among caller-defined possibilities grounded in what is visible now.</p>
        </div>
        <div class="primitive-card">
          <span class="number">03 / SCORE</span><code>rate()</code>
          <p>Place browser state on an explicit ordered scale instead of generating prose.</p>
        </div>
        <div class="primitive-card">
          <span class="number">04 / COMPOSED</span><code>act()</code>
          <p>Rank, select, execute, and verify one browser intent—or fill a whole form in bulk.</p>
        </div>
      </div>
    </section>

    <section class="home-section">
      <p class="eyebrow">Playwright-native</p>
      <h2>Use exact code when you know. Use Jev when the page decides.</h2>
      <p class="lede">
        The wrapped object retains Playwright locators, navigation, screenshots, events, and
        assertions alongside PlayJev.
      </p>
      <div class="code-window">
        <div class="code-titlebar"><i></i><i></i><i></i></div>
        <pre
          v-pre
        ><span class="kw">import</span> { chromium } <span class="kw">from</span> <span class="str">"playwright"</span>;
<span class="kw">import</span> { playjev } <span class="kw">from</span> <span class="str">"@filed/playjev"</span>;

<span class="kw">const</span> browser = <span class="kw">await</span> chromium.<span class="fn">launch</span>();
<span class="kw">const</span> page = <span class="fn">playjev</span>(<span class="kw">await</span> browser.<span class="fn">newPage</span>());

<span class="kw">await</span> page.<span class="fn">goto</span>(<span class="str">"https://example.com"</span>);
<span class="kw">await</span> page.<span class="fn">act</span>(<span class="str">"Open the documentation"</span>);
<span class="kw">const</span> ready = <span class="kw">await</span> page.<span class="fn">check</span>(<span class="str">"Is the API guide visible?"</span>);</pre>
      </div>
    </section>

    <section class="home-section cta-panel">
      <p class="eyebrow">Start with a page</p>
      <h2>Make browser automation readable again.</h2>
      <p class="lede">
        Bring your own Playwright page, add your TypeSafe API key, and keep control of every
        deterministic browser operation.
      </p>
      <div class="cta-links">
        <a href="./guide/getting-started">Read the quickstart</a
        ><a class="secondary" href="https://github.com/filedcom/playjev">View on GitHub</a>
      </div>
    </section>

    <p style="color: var(--vp-c-text-3); font-size: 12px">
      * Observed on the public Stagehand cross-origin iframe fixture; network and Jev latency vary.
    </p>
  </div>
</template>
