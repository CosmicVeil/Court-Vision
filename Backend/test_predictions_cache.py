import unittest

from generate_predictions_cache import build_recommendations


class PredictionsCacheGenerationTests(unittest.TestCase):
    def test_build_recommendations_generates_all_supported_stats(self):
        calls = []

        def fake_getter(stat):
            calls.append(stat)
            return [{"stat": stat}]

        actual = build_recommendations(fake_getter)

        self.assertEqual(calls, ["PPG", "APG", "RPG", "PRA"])
        self.assertEqual(
            actual,
            {
                "PPG": [{"stat": "PPG"}],
                "APG": [{"stat": "APG"}],
                "RPG": [{"stat": "RPG"}],
                "PRA": [{"stat": "PRA"}],
            },
        )


if __name__ == "__main__":
    unittest.main()
