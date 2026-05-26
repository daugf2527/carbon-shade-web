#pragma once

#include <vector>
#include <string>
#include <array>
#include <cassert>
#include "PvfReader.h"
#include "PvfAnimation.h"
#include "BufferReader.h"
#include "PvfString.h"

PvfAnimation::PvfAnimation(const uint8_t* buffer, int32_t len, PvfReader* reader)
	:buffer(buffer),len(len), reader(reader)
{
	type = PvfScriptType::Animation;
}

auto PvfAnimation::unpack() -> void
{
	BufferReader reader(buffer, len);
	framesCount = reader.read<uint16_t>();
	auto countOfResources = reader.read<uint16_t>();
	frames.resize(framesCount);
	std::vector<std::string> sprites;
	for (auto i = 0; i < countOfResources; i++)
	{
		int32_t len = reader.read<int32_t>();
		sprites.emplace_back(reader.readAsciiString(len));
		PvfString::toLower(sprites.back());
	}

	// Audit P1-13 (2026-05-26): global-params switch only handled LOOP and
	// SHADOW. For any other attribute type the implicit default no-op'd —
	// stream pointer did NOT advance past the unread payload, so the
	// subsequent frames loop read mis-aligned data. We don't know the
	// payload size of unknown global params, so the conservative fix is:
	// log the unknown type to stderr and abort the entire .ani parse
	// (clear frames so consumers see "0 frames" rather than garbage).
	auto params = reader.read<uint16_t>();
	bool globalParamsCorrupt = false;
	for (auto j = 0; j < params; j++)
	{
		auto type = reader.read<uint16_t>();
		switch (type)
		{
		case AnimationNodeType::LOOP:
			loop = reader.read<int8_t>();
			break;

		case AnimationNodeType::SHADOW:
			shadow = reader.read<int8_t>();
			break;

		default:
			fprintf(stderr, "[ERROR] PvfAnimation: unknown global param type %d "
				"(cannot determine payload size) — aborting params/frames parse\n",
				(int)type);
			globalParamsCorrupt = true;
			break;
		}
		if (globalParamsCorrupt) break;
	}
	if (globalParamsCorrupt) {
		framesCount = 0;
		frames.clear();
		return;
	}

	for (auto i = 0; i < framesCount; i++)
	{
		auto& frame = frames[i];

		auto boxes = reader.read<uint16_t>();
		for (auto j = 0; j < boxes; j++)
		{
			auto type = reader.read<uint16_t>();
			assert(type == DAMAGE_BOX || type == ATTACK_BOX);
			auto& box = type == DAMAGE_BOX ? frame.damageBox.emplace_back() : frame.attackBox.emplace_back();
			for (int32_t m = 0; m < 6; m++)
			{
				box[m] = reader.read<int32_t>();
			}
		}
		frame.imgId = reader.read<uint16_t>();
		frame.imgParam = reader.read<uint16_t>();
		// Audit F2: bounds-check imgId BEFORE dereferencing sprites[].
		// Previously the assert came after the access, and release-mode no-op'd
		// the assert → vector OOB on a corrupted .ani.
		if (frame.imgId >= sprites.size()) {
			fprintf(stderr, "[ERROR] PvfAnimation: frame.imgId=%u out of range (sprites.size=%zu)\n",
				(unsigned)frame.imgId, sprites.size());
			frame.path.clear();
		} else {
			frame.path = sprites[frame.imgId];
		}

		frame.x = reader.read<int32_t>();
		frame.y = reader.read<int32_t>();

		int32_t propertyCount = reader.read<uint16_t>();
		// Audit P0-3 (2026-05-26): per-frame property switch had empty
		// `case 2/4/5/6/19/20/21/22:` and `case DAMAGE_BOX/ATTACK_BOX/SPECTRUM:`
		// no-op branches plus an implicit default no-op. For any of these
		// the stream pointer did NOT advance past the attribute's payload
		// (because the payload size is unknown), so subsequent attributes
		// (and subsequent frames) parsed garbage. Conservative fix: on any
		// unhandled attribute type, log to stderr and abort the rest of
		// this animation's frame loop. We drop the partially-parsed current
		// frame so consumers see a clean truncation rather than half-set
		// frame data.
		bool frameStreamCorrupt = false;
		for (int32_t m = 0; m < propertyCount; m++)
		{
			AnimationNodeType type = (AnimationNodeType)reader.read<uint16_t>();
			switch (type) {
			case LOOP:
				frame.loop = reader.read<int8_t>();
				break;
			case SHADOW:
				frame.shadow = reader.read<int8_t>();
				break;
			case INTERPOLATION:
				frame.interpolation = reader.read<int8_t>();
				break;
			case Ani_COORD:
				frame.coord = reader.read<uint16_t>();
				break;
			case IMAGE_RATE:
				frame.rateX = reader.read<float>();
				frame.rateY = reader.read<float>();
				break;
			case IMAGE_ROTATE:
				frame.rotate = reader.read<int32_t>();
				break;
			case RGBA:
				frame.color = reader.read<uint32_t>();
				break;
			case GRAPHIC_EFFECT:
				frame.itemType = (EffectItem)reader.read<uint16_t>();
				if (frame.itemType == EffectItem::MONOCHROME)
				{
					frame.effectItem.effectColor.r = reader.read<uint8_t>();
					frame.effectItem.effectColor.g = reader.read<uint8_t>();
					frame.effectItem.effectColor.b = reader.read<uint8_t>();
				}
				else if (frame.itemType == SPACEDISTORT)
				{
					frame.effectItem.pos.x = reader.read<uint16_t>();
					frame.effectItem.pos.y = reader.read<uint16_t>();
				}
				break;
			case DELAY://12
				frame.delay = reader.read<int32_t>();
				break;
			case DAMAGE_TYPE:
				frame.damageType = (DamageType)reader.read<uint16_t>();
				break;
			case PLAY_SOUND:
				frame.sound = reader.readAsciiString(reader.read<int32_t>());
				break;
			case PRELOAD:
				break;
			case SET_FLAG:
				frame.setFlag = reader.read<int32_t>();
				break;
			case FLIP_TYPE:
				frame.flipType = (FlipType)reader.read<uint16_t>();
				break;
			case LOOP_START:
				frame.loopStart = true;
				break;
			case LOOP_END:
				frame.loopEnd = reader.read<int32_t>();
				break;
			case CLIP:
				frame.clip[0] = reader.read<int16_t>();
				frame.clip[1] = reader.read<int16_t>();
				frame.clip[2] = reader.read<int16_t>();
				frame.clip[3] = reader.read<int16_t>();
				break;
			default:
				// Unknown attribute type (observed gaps: 2/4/5/6/19/20/21/22)
				// or types whose per-frame payload we don't model
				// (DAMAGE_BOX/ATTACK_BOX/SPECTRUM appear at the frame-boxes
				// level, not the property level — encountering them here
				// indicates either corruption or an unmodeled .ani variant).
				fprintf(stderr, "[ERROR] PvfAnimation: unknown per-frame attribute "
					"type %d at frame %d, property %d "
					"(cannot determine payload size) — aborting frame parse\n",
					(int)type, i, m);
				frameStreamCorrupt = true;
				break;
			}
			if (frameStreamCorrupt) break;
		}
		if (frameStreamCorrupt) {
			// Drop the partially-populated current frame so callers see
			// only fully-parsed frames; downstream consumers handle a
			// short frames[] gracefully.
			frames.resize(i);
			framesCount = (int32_t)frames.size();
			return;
		}
	}
}
