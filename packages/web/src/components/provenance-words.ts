/**
 * What each provenance id stands for, in words a reader who has not read `docs/RULES.md` can use
 * (#243). Drawn from its "Source registry" and the rules that cite each source, narrowed to what
 * the built rules take from it: a source whose rule is not built yet says so. Change RULES first,
 * then this. Display only; core's `PROVENANCE_IDS` stays the list of ids.
 */
import type { ProvenanceId } from "@wayford/core";

/**
 * One source: `name`, what it is; `anchors`, what Wayford's built rules take from it, or what a
 * rule not built yet would; `citation`, where to find it, null for an id with nothing behind it
 * (`folk`, `llm`). Each is a phrase, with no full stop.
 */
export type ProvenanceWords = {
  name: string;
  anchors: string;
  citation: string | null;
};

/** Every id's words. Keyed by `ProvenanceId`, so an id with none fails typecheck. */
export const PROVENANCE_WORDS: Record<ProvenanceId, ProvenanceWords> = {
  wcag22: {
    name: "WCAG 2.2, the W3C's web accessibility standard",
    anchors: "contrast 4.5:1, 3:1 and 7:1, and targets of 24 and 44 px",
    citation: "W3C, success criteria 1.4.3, 1.4.6, 2.5.5 and 2.5.8",
  },
  machado2009: {
    name: "Machado, Oliveira and Fernandes, a model of how colour vision varies",
    anchors: "the colour shift a run's screenshots show; nothing that reaches the model changes",
    citation:
      "'A physiologically-based model for simulation of color vision deficiency', IEEE TVCG, 2009",
  },
  legge2011: {
    name: "Legge and Bigelow, a review of print size and reading",
    anchors: "the font-size cut, whose px are set by hand, not yet derived from an acuity",
    citation:
      "'Does print size matter for reading? A review of findings from vision science and typography', Journal of Vision, 2011",
  },
  parhi2006: {
    name: "Parhi, Karlson and Bederson, a study of touch target size",
    anchors: "a touch target of 9.2 mm for one thumb",
    citation:
      "'Target size study for one-handed thumb use on small touchscreen devices', MobileHCI 2006",
  },
  hig: {
    name: "Apple's design guidelines for its platforms",
    anchors: "the 44 pt touch target",
    citation: "Apple, Human Interface Guidelines",
  },
  material: {
    name: "Google's design system for apps and the web",
    anchors: "the 48 dp touch target",
    citation: "Google, Material Design",
  },
  fitts: {
    name: "Fitts's law: pointing at a target takes longer the farther and smaller it is",
    anchors: "how long a pointer move takes, from its distance and the target's width",
    citation: "Fitts, 1954; MacKenzie, 1992; MacKenzie, Sellen and Buxton, CHI 1991",
  },
  klm: {
    name: "The keystroke-level model, which times a task from its basic actions",
    anchors: "the time each action takes: preparing for it, a keystroke, a button press",
    citation:
      "Card, Moran and Newell, CACM 23(7), 1980, and The Psychology of Human-Computer Interaction, 1983; Kieras, 1993",
  },
  iso9241: {
    name: "ISO 9241-9, the standard for testing pointing devices",
    anchors: "a target's effective width, and how often a click misses",
    citation: "ISO 9241-9, now ISO 9241-411",
  },
  hick: {
    name: "Hick's law: a choice takes longer the more options it has",
    anchors: "choice time against the number of options, for an option cap not built yet",
    citation: "Hick, 1952; Hyman, 1953",
  },
  cowan2001: {
    name: "Cowan's review of short-term memory",
    anchors: "a working memory of about four chunks",
    citation: "'The magical number 4 in short-term memory', Behavioral and Brain Sciences, 2001",
  },
  nngroup: {
    name: "Nielsen Norman Group's usability research",
    anchors:
      "hidden navigation, the F-pattern, scrolling and attention, and icons; banners passed over as ads, for a rule not built yet",
    citation: "Nielsen Norman Group articles, each cited in the rule that uses it",
  },
  benway1998: {
    name: "Benway's study of banners on web pages",
    anchors: "banners passed over as ads, for a rule not built yet",
    citation:
      "Benway, Proceedings of the Human Factors and Ergonomics Society 42nd Annual Meeting, 1998",
  },
  nielsen: {
    name: "Jakob Nielsen's work on usability",
    anchors: "response time limits, and when a wait is given up",
    citation: "Nielsen, Usability Engineering, 1993; nngroup.com on response times",
  },
  piaac: {
    name: "The OECD's survey of adult skills",
    anchors: "levels of digital skill",
    citation:
      "OECD, PIAAC; Nielsen Norman Group, 'The distribution of users' computer skills', 2016",
  },
  pisarek: {
    name: "Pisarek's fog index, a readability measure for Polish",
    anchors: "how hard a Polish text is to read, for a rule not built yet",
    citation: "Pisarek, fog index",
  },
  flesch: {
    name: "Flesch-Kincaid and Gunning fog, readability measures for English",
    anchors: "how hard an English text is to read, for a rule not built yet",
    citation: "Flesch-Kincaid grade level; Gunning fog index",
  },
  plain: {
    name: "The US federal government's plain language guidelines",
    anchors: "the idea of jargon behind K2; the list of jargon terms itself is folk",
    citation: "PLAIN, Federal Plain Language Guidelines",
  },
  personalayer: {
    name: "PersonaLayer, a set of UX profiles",
    anchors: "a checklist of dimensions Wayford does or does not model",
    citation: "PersonaLayer, 45 UX profiles",
  },
  folk: {
    name: "No published source",
    anchors:
      "anything set without a source, such as a team's number or list, or a threshold moved on the Lens",
    citation: null,
  },
  llm: {
    name: "No published source: a model wrote it",
    anchors: "a profile, threshold or word list a model wrote from a prompt",
    citation: null,
  },
};

/** What a hint says in place of a citation: nothing backs the value, and the screens say so. */
export const NO_CITATION = "Nothing to cite, so what rests on it is soft, drawn dotted";

/**
 * The hint a provenance tag opens: the source's name, what it anchors in Wayford's rules, then its
 * citation, or that there is none to give. The anchors are the source's across the rules, not only
 * the threshold beside the tag.
 */
export function provenanceHint(id: ProvenanceId): string {
  const { name, anchors, citation } = PROVENANCE_WORDS[id];
  return `${name}. In Wayford: ${anchors}. ${citation ?? NO_CITATION}.`;
}
