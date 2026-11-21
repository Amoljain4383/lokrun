# Lokrun – Academic Viva & Project Defense Notes
**SNJB's KBJ College of Engineering, Chandwad**
*Department of Artificial Intelligence & Data Science*
*Community Engagement Project – Second Year Engineering*

---

### Q1: Why was Node.js standard built-in `http` chosen over Express or Fastify?
**Answer**:
1. **Zero External Dependencies**: Eliminates supply chain risks, vulnerability audits, and reliance on package registries (`node_modules`), making the platform 100% portable and capable of running in air-gapped, offline environments.
2. **Pedagogical Clarity**: Implementing request routing, query parsing, body chunk buffering, and HTTP header management using native Node.js core streams demonstrates a foundational understanding of the underlying HTTP protocol rather than relying on framework abstractions.

---

### Q2: How does the atomic JSON storage mechanism work in `data/db.json`?
**Answer**:
Writing directly to a target file risks catastrophic data corruption if the system crashes or loses power mid-write. Lokrun implements **atomic write semantics**:
1. The updated in-memory database object is serialized to formatted JSON.
2. It is written to a unique staging file in the same directory (`.tmp_db.json_<timestamp>_<random>`).
3. Once the temporary file write completes, `fs.renameSync` is called. The underlying operating system filesystem driver replaces the file pointer atomically in a single file-system operation. If a crash occurs, either the old valid database remains or the new valid database is mounted—never a half-written file.

---

### Q3: How is the reference ID (`LK-XXXXXX`) generated and collision-checked?
**Answer**:
1. The ID consists of the `LK-` prefix followed by a cryptographically random 6-digit integer (`100000` to `999999`) generated using `crypto.randomInt()`.
2. Before assigning the ID, the server queries a `Set` of all existing report IDs in `db.reports`.
3. If an ID exists, the loop regenerates a new random number until an unused ID is found, guaranteeing zero ID collisions.

---

### Q4: How does image magic-byte validation work and why is it superior to extension checks?
**Answer**:
File extensions (`.jpg`, `.png`) and HTTP `Content-Type` headers are easily spoofed by malicious actors (e.g., renaming a script or executable to `.jpg`).
Lokrun performs **binary inspection** on the first few bytes (the "magic bytes" or file signature) of the decoded base64 buffer:
- **JPEG**: Must begin with bytes `0xFF 0xD8 0xFF`.
- **PNG**: Must begin with bytes `0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A`.
- **WEBP**: Must start with `RIFF` at offset 0–3 and `WEBP` at offset 8–11.
If the byte signature does not match or if the buffer exceeds 5 MB (`5 * 1024 * 1024` bytes), the request is rejected with `400 Bad Request`.

---

### Q5: How does geolocation work and what happens when it is denied or unsupported?
**Answer**:
1. The citizen form uses the browser's native `navigator.geolocation.getCurrentPosition()` API with high-accuracy mode.
2. If the user allows location access, the browser captures latitude and longitude to 6 decimal places (~0.1m precision).
3. If the user denies permission, if GPS times out, or if the browser lacks support, the application does not fail. It presents a friendly warning banner, leaves `lat` and `lng` empty (`null`), and relies on the mandatory manual landmark/address text field. Only authentic, browser-detected coordinates are ever saved to the database.

---

### Q6: How are passwords hashed and admin sessions authenticated?
**Answer**:
1. **Hashing**: Passwords are never stored in plaintext. They are hashed using Node's cryptographic key derivation function `crypto.scryptSync` with a unique 16-byte random salt and 64-byte derived key length. Scrypt is deliberately memory-hard and computationally intensive to defend against GPU/ASIC rainbow table brute-force attacks.
2. **Comparison**: Password verification derives the hash with the stored salt and compares it using `crypto.timingSafeEqual` to eliminate side-channel timing attacks.
3. **Sessions**: Upon successful login, the server generates a cryptographically random 32-byte hexadecimal session token (`crypto.randomBytes(32)`), stores it with a 24-hour expiration in an active session map, and issues an `HttpOnly; Path=/; SameSite=Lax` cookie. This prevents client-side JavaScript from accessing session tokens, mitigating cookie theft via XSS.

---

### Q7: How is citizen privacy enforced on public tracking endpoints?
**Answer**:
The public endpoint `GET /api/track/:id` implements strict **data minimization**:
1. It projects only public civic fields: `id`, `category`, `landmark`, `status`, `createdAt`, `updatedAt`, and `timeline`.
2. Citizen personal data (`contact.name`, `contact.phone`, `contact.email`) and raw image filenames are strictly stripped on the server.
3. The timeline exposes only public status transitions and dates (`{ status, timestamp }`). Internal engineering notes, administrative IDs, and staff comments are completely hidden.

---

### Q8: How does the platform defend against Cross-Site Scripting (XSS)?
**Answer**:
1. **DOM Injection Prevention**: All dynamic values received from server API responses are rendered into the DOM exclusively using `.textContent = ...` or `document.createElement()`. The application never sets `element.innerHTML` with server-supplied data.
2. Even if a user inputs an XSS payload like `<script>alert(1)</script>` into a title or landmark, the browser parses it strictly as text characters, preventing script execution.
3. In addition, the backend injects standard defensive HTTP security headers on every response:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: no-referrer`
   - `X-XSS-Protection: 1; mode=block`

---

### Q9: How are the analytics charts generated without third-party chart libraries?
**Answer**:
To keep the codebase dependency-free and lightweight:
1. Category, priority, and status distributions are calculated as percentage proportions from live API counts: `percentage = (count / totalReports) * 100`.
2. Proportions are rendered using semantic HTML and CSS progress tracks with CSS variables and transition easing.
3. When `totalReports === 0`, all charts cleanly swap to an informative empty state card ("No reports yet") rather than crashing or displaying NaN values.

---

### Q10: What are the main limitations of this local prototype and how would it scale in production?
**Answer**:
1. **Database**: Single JSON file works well for ~10,000 prototype records, but lacks multi-thread concurrency and spatial indexing. Production would migrate to PostgreSQL with PostGIS for spatial bounding box queries.
2. **Network**: Operates over plaintext HTTP locally. Production requires HTTPS/TLS certificates (e.g. Let's Encrypt).
3. **Authorization**: Currently uses a unified "Administrator" role. Production would introduce Role-Based Access Control (RBAC) separating Field Technicians, Ward Supervisors, Municipal Commissioners, and System Admins.
4. **Automated Triage (Next Phase for AI & Data Science)**: Integrate computer vision models to automatically assess pothole depth and classify severity from uploaded photos upon submission.
