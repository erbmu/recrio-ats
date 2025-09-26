export default function Privacy() {
  const Updated = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return (
    <div className="max-w-3xl mx-auto p-6">
      <header className="pt-10 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Recrio Candidate Privacy Notice
        </h1>
        <p className="text-zinc-600 mt-2 text-sm">Last updated: {Updated}</p>
      </header>

      <div className="space-y-6 text-zinc-800">
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Who we are</h2>
          <p>
            Recrio (“we”, “us”) provides tools that help employers review candidates.
            We act as a <strong>data processor</strong> for employers who use our services and as a
            <strong> data controller</strong> for the parts of the service we operate directly
            (for example, hosting your application for the employer).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">What we collect</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li><strong>Contact details</strong> — name, email, phone, city, country.</li>
            <li><strong>Application content</strong> — your answers and any files (career card, resume).</li>
            <li><strong>Professional links</strong> — LinkedIn, portfolio.</li>
            <li>
              <strong>Optional details</strong> — years of experience, current title, expected salary,
              work preferences, relocation interest, and (where legally permitted) date of birth for
              identity checks after an offer.
            </li>
            <li><strong>Technical data</strong> — IP, device/browser info, timestamps for security.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">How we use your data</h2>
          <ul className="list-disc ml-6 space-y-1">
            <li>Transmit your application to the selected employer.</li>
            <li>Run automated checks to help review applications (parsing, de-duplication, basic scoring).</li>
            <li>Communicate with you about your application.</li>
            <li>Secure our services and meet legal obligations.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Legal bases</h2>
          <p>
            We process your data based on <strong>consent</strong>, <strong>performance of a contract</strong>
            (processing your application at your request), and <strong>legitimate interests</strong>
            (service security, preventing abuse). Where required, we rely on your
            <strong> explicit consent</strong> for optional/sensitive fields.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Sharing</h2>
          <p>
            We share your application with the <strong>employer</strong> and with service providers
            who help us operate the platform (e.g., secure hosting/storage). We do <strong>not sell</strong> your data.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">International transfers</h2>
          <p>
            Your data may be processed in countries that may not offer the same level of protection as your
            home country. Where required, we use appropriate safeguards (e.g., Standard Contractual Clauses).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Retention</h2>
          <p>
            We retain applications for up to <strong>24 months</strong> unless the employer asks us to delete
            sooner or you request deletion (subject to legal requirements).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Your rights</h2>
          <p>
            Depending on your location, you may have rights to access, correct, delete, or restrict processing,
            and to withdraw consent at any time. Contact <a className="underline" href="mailto:privacy@recrio.app">privacy@recrio.app</a>
            (or the employer).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Security</h2>
          <p>
            We use industry-standard measures (encryption in transit, access controls, auditing, data minimization).
            No system is 100% secure; avoid uploading unnecessary highly sensitive data.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Children</h2>
          <p>Not intended for individuals under <strong>16</strong>.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p>Questions or requests: <a className="underline" href="mailto:privacy@recrio.app">privacy@recrio.app</a></p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Updates</h2>
          <p>We may update this notice and will post the new version here with a revised date.</p>
          <p className="text-xs text-zinc-500">
            <em>Replace contact email and retention period with your actual details before launch.</em>
          </p>
        </section>
      </div>
    </div>
  );
}
