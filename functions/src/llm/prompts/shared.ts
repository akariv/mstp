/** Rules shared by every Test Maker prompt about what counts as test content. */
export const EXAMPLES_RULE = `
EXAMPLES ARE NOT CONTENT: study material often uses content from another domain only as an illustration of the
concept that is actually taught. For example, a Dutch or English grammar text may use a sentence about physics
("De auto versnelt omdat er een kracht op werkt") to show word order or verb position; a maths text may use a story
about a football club to show percentages. What must be learned is the concept (word order, percentages), not the
physics or the football. Never treat the subject matter of such an example as something the student must know (but keep the example
itself: it shows how the concept works).
Judge what is taught from the subject of the course, the headings, the explanations and the exercises.
`.trim();

export const SPANNING_RULE = `
CONTEXT SPANS PAGES AND FILES: the material may be uploaded as separate pages (photos or scans of single pages)
or split into parts. A chapter, explanation, table, list or exercise can start on one page and continue on the
next, sometimes in another file. Read the material as one continuous text in page order and combine the pieces
of the same topic before deciding what is taught.
`.trim();
