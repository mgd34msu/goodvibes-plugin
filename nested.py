
class Outer:
    def outer_method(self):
        def inner_function():
            pass
    
    class Inner:
        def inner_method(self):
            pass

def outer_function():
    def nested():
        pass
      