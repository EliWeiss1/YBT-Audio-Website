Put manual reference clips here, one folder per rabbi (folder name = speaker slug):

  reference_samples/
    rabbi-matt-schneeweiss/
      clean_sample_1.mp3
      clean_sample_2.mp3
    rabbi-zev-cinamon/
      ...

A "clean" reference clip is audio of ONLY that rabbi talking (no student voices),
ideally 30s+. You can mix manual clips here with --ids bootstrapped from the site;
build_reference_profile.py uses whatever is present.

The slug is the rabbi's name lowercased with non-alphanumerics collapsed to hyphens,
e.g. "Rabbi Matt Schneeweiss" -> "rabbi-matt-schneeweiss". Run
`python src/build_reference_profile.py --list-speakers "schneeweiss"` to see the exact
slug the tool derives for a given site speaker.
