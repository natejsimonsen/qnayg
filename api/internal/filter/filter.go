package filter

import (
	"strings"
	"unicode"
)

var bannedWords = []string{
	"fuck", "shit", "ass", "bitch", "cunt", "dick", "cock", "pussy",
	"nigger", "nigga", "faggot", "fag", "whore", "slut", "bastard",
	"motherfucker", "asshole", "bullshit", "damn", "crap", "piss",
	"rape", "porn", "sex", "penis", "vagina", "boobs", "tits",
	"nude", "naked", "masturbat", "dildo", "horny", "orgasm",
}

func ContainsBannedWord(text string) bool {
	normalized := strings.ToLower(text)
	normalized = strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsSpace(r) {
			return r
		}
		return ' '
	}, normalized)

	words := strings.Fields(normalized)
	for _, word := range words {
		for _, banned := range bannedWords {
			if word == banned || strings.Contains(word, banned) {
				return true
			}
		}
	}
	return false
}
