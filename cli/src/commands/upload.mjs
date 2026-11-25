// Sends an item's languages to Steam. The primary language goes with the content, the preview, the tags and the change
// note; every other allowed language follows as its own text-only update, so a player never sees a mix of languages.
import { VISIBILITY } from '../item.mjs'

export async function sendLanguages(session, { itemId, appId, validated, staged, visibility, tags, changeNote, previewFile, out }) {
    const primary = validated.languages.find((l) => l.code === validated.primaryLanguage)
    const main = await session.submit(itemId, {
        title: primary.title,
        description: primary.description,
        language: primary.code,
        changeNote,
        previewPath: previewFile,
        contentPath: staged.contentDir,
        visibility: VISIBILITY[visibility],
        tags,
    }, { appId })
    out.say(`primary language ${primary.code}: content, preview, title and description sent`)
    let agreement = main.agreement
    for (const language of validated.languages) {
        if (language.code === primary.code) continue
        const text = await session.submit(itemId, {
            title: language.title,
            description: language.description,
            language: language.code,
        }, { appId })
        out.say(`language ${language.code}: title and description sent (text only)`)
        agreement = agreement || text.agreement
    }
    return agreement
}
