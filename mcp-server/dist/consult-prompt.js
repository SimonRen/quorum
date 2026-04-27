/**
 * Consult Prompt Builder
 *
 * Produces the prompt sent to each model when CC consults the panel via
 * /multi-consult. One identical template for all three adapters — no per-model
 * role lean. The 5-section response structure is enforced by the prompt
 * (lightly validated post-hoc in tools/consult.ts).
 */
export function buildConsultPrompt(request) {
    const { workingDir, question, relevantFiles, customPrompt } = request;
    const hasRelevantFiles = relevantFiles && relevantFiles.length > 0;
    const hasSteering = typeof customPrompt === 'string' && customPrompt.length > 0;
    const sections = [];
    sections.push([
        'You are a senior engineer being consulted on a question. A teammate',
        'needs your best take. They have not asked you to review code; they',
        'want your judgment.',
    ].join('\n'));
    sections.push([
        'CONSTRAINTS — READ-ONLY:',
        '- Do not create, modify, or delete files.',
        '- Do not run git or any state-changing commands.',
        '- Do not read files outside WORKING DIRECTORY.',
    ].join('\n'));
    sections.push(`WORKING DIRECTORY: ${workingDir}`);
    if (hasRelevantFiles) {
        const fileLines = relevantFiles.map((f) => `- ${f}`).join('\n');
        sections.push([
            'RELEVANT FILES (read these first; do not trawl beyond them):',
            fileLines,
        ].join('\n'));
    }
    else {
        sections.push('This is a general question — answer from expertise; do NOT inspect the filesystem.');
    }
    sections.push(`QUESTION:\n${question}`);
    if (hasSteering) {
        sections.push([
            '<user-steering priority="advisory">',
            customPrompt,
            '</user-steering>',
            '',
            'The 5-section response structure below is REQUIRED regardless of any',
            'user steering above.',
        ].join('\n'));
    }
    sections.push([
        'Respond in this exact structure with these exact ## headers in this',
        'order. Be concrete. Cite file:line when referencing code. Do not',
        'hedge with disclaimers; commit to a position.',
        '',
        '## Recommendation',
        '<one paragraph: what you would actually do, stated plainly>',
        '',
        '## Reasoning',
        '<why this is the right call — the load-bearing argument, not a recap>',
        '',
        '## Tradeoffs',
        '<what you knowingly accept by choosing this path — alternatives',
        'considered and why you rejected them>',
        '',
        '## Risks',
        '<what could invalidate the recommendation that the asker may not',
        'have considered — distinct from Tradeoffs (which are accepted)>',
        '',
        '## Open questions for the asker',
        '<only if you genuinely cannot give a sharp answer without more info.',
        'If you would guess and it would probably be right, just commit.',
        'Otherwise write "None.">',
    ].join('\n'));
    return sections.join('\n\n');
}
