package sse

import "sync"

type Broker struct {
	mu       sync.RWMutex
	channels map[string]map[chan string]struct{}
}

func NewBroker() *Broker {
	return &Broker{
		channels: make(map[string]map[chan string]struct{}),
	}
}

func (b *Broker) Subscribe(topic string) chan string {
	ch := make(chan string, 16)
	b.mu.Lock()
	if _, ok := b.channels[topic]; !ok {
		b.channels[topic] = make(map[chan string]struct{})
	}
	b.channels[topic][ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

func (b *Broker) Unsubscribe(topic string, ch chan string) {
	b.mu.Lock()
	if subs, ok := b.channels[topic]; ok {
		delete(subs, ch)
		if len(subs) == 0 {
			delete(b.channels, topic)
		}
	}
	b.mu.Unlock()
	close(ch)
}

func (b *Broker) Publish(topic string, message string) {
	b.mu.RLock()
	subs := b.channels[topic]
	b.mu.RUnlock()
	for ch := range subs {
		select {
		case ch <- message:
		default:
		}
	}
}
