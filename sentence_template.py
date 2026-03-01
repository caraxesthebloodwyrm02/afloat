# Template for sentence generation
template = "Here is a [type] sentence with exactly [count] characters. It includes [list] to ensure [reason]."

# Demonstration of usage
def generate_sentence(type_val, count_val, list_val, reason_val):
    return template.replace("[type]", type_val).replace("[count]", count_val).replace("[list]", list_val).replace("[reason]", reason_val)

# Example usage
if __name__ == "__main__":
    print(generate_sentence("sample", "150", "spaces, commas, and periods", "proper grammar"))
    print(generate_sentence("test", "100", "punctuation", "clarity"))
