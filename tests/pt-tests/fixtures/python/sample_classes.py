# Sample Python file with classes, methods, and functions

from typing import List, Optional
from dataclasses import dataclass

@dataclass
class Person:
    name: str
    age: int

    def greet(self) -> str:
        return f"Hello, I'm {self.name}"

class Animal:
    def __init__(self, name: str):
        self.name = name
        self._private_var = 0

    def make_sound(self) -> None:
        raise NotImplementedError

    def _private_method(self) -> int:
        return self._private_var

class Dog(Animal):
    def __init__(self, name: str, breed: str):
        super().__init__(name)
        self.breed = breed

    def make_sound(self) -> None:
        print("Woof!")

    def fetch(self, item: str) -> str:
        return f"{self.name} fetched {item}"

def standalone_function(x: int, y: int) -> int:
    return x + y

def function_with_defaults(name: str, age: int = 0, active: bool = True) -> dict:
    return {"name": name, "age": age, "active": active}

async def async_function(url: str) -> str:
    # Simulated async operation
    return f"Fetched {url}"

class Calculator:
    @staticmethod
    def add(a: int, b: int) -> int:
        return a + b

    @classmethod
    def create_default(cls):
        return cls()

    def multiply(self, a: int, b: int) -> int:
        return a * b
